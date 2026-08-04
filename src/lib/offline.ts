import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyLog, Profile } from '../types';
import { getSupabase } from './supabase';

const DB_NAME = 'modo-brigido-offline';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const QUEUE_STORE = 'queue';
const SYNC_EVENT = 'modo-brigido-sync-status';

type MutationOperation = 'upsert' | 'update' | 'delete';

export type OfflineMutation = {
  id?: number;
  operation: MutationOperation;
  table: string;
  payload?: Record<string, unknown> | Record<string, unknown>[];
  match?: Record<string, unknown>;
  onConflict?: string;
  dedupeKey?: string;
  createdAt: string;
};

export type SyncStatus = {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastError: string | null;
};

let status: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
  lastError: null
};
let syncPromise: Promise<void> | null = null;
let listenersStarted = false;

function emitStatus(patch: Partial<SyncStatus> = {}) {
  status = { ...status, ...patch, online: typeof navigator === 'undefined' ? true : navigator.onLine };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: status }));
}

export function getSyncStatus(): SyncStatus {
  return status;
}

export function subscribeSyncStatus(listener: (next: SyncStatus) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<SyncStatus>).detail);
  window.addEventListener(SYNC_EVENT, handler);
  listener(status);
  return () => window.removeEventListener(SYNC_EVENT, handler);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('dedupeKey', 'dedupeKey', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento offline.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error de almacenamiento local.'));
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    const transaction = db.transaction(storeName, mode);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Falló la transacción local.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('La transacción local fue cancelada.'));
    });
    const result = await requestResult(action(transaction.objectStore(storeName)));
    await done;
    return result;
  } finally {
    db.close();
  }
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  await withStore(CACHE_STORE, 'readwrite', (store) => store.put({ key, value, updatedAt: new Date().toISOString() }));
}

export async function getCached<T>(key: string): Promise<T | null> {
  const row = await withStore<any>(CACHE_STORE, 'readonly', (store) => store.get(key));
  return row?.value ?? null;
}

export async function removeCached(key: string): Promise<void> {
  await withStore(CACHE_STORE, 'readwrite', (store) => store.delete(key));
}

async function getQueue(): Promise<OfflineMutation[]> {
  return withStore<OfflineMutation[]>(QUEUE_STORE, 'readonly', (store) => store.getAll());
}

async function deleteQueueItem(id: number): Promise<void> {
  await withStore(QUEUE_STORE, 'readwrite', (store) => store.delete(id));
}

export async function queueMutation(mutation: Omit<OfflineMutation, 'createdAt'>): Promise<void> {
  const existing = mutation.dedupeKey
    ? (await getQueue()).filter((item) => item.dedupeKey === mutation.dedupeKey)
    : [];
  const db = await openDb();
  try {
    const transaction = db.transaction(QUEUE_STORE, 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);
    for (const item of existing) {
      if (item.id !== undefined) store.delete(item.id);
    }
    store.add({ ...mutation, createdAt: new Date().toISOString() });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo guardar el cambio pendiente.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Se canceló el guardado local.'));
    });
  } finally {
    db.close();
  }
  const pending = (await getQueue()).length;
  emitStatus({ pending });
}

async function runMutation(client: SupabaseClient, mutation: OfflineMutation): Promise<void> {
  let query: any;
  if (mutation.operation === 'upsert') {
    query = client.from(mutation.table).upsert(mutation.payload as any, mutation.onConflict ? { onConflict: mutation.onConflict } : undefined);
  } else if (mutation.operation === 'update') {
    query = client.from(mutation.table).update(mutation.payload as any);
    for (const [key, value] of Object.entries(mutation.match ?? {})) query = query.eq(key, value);
  } else {
    query = client.from(mutation.table).delete();
    for (const [key, value] of Object.entries(mutation.match ?? {})) query = query.eq(key, value);
  }
  const { error } = await query;
  if (error) throw error;
}

export async function syncPendingMutations(): Promise<void> {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    let queued = await getQueue();
    emitStatus({ pending: queued.length });
    if (!navigator.onLine || queued.length === 0) return;

    emitStatus({ syncing: true, lastError: null });
    try {
      const client = getSupabase();
      while (navigator.onLine && queued.length > 0) {
        for (const mutation of queued.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
          await runMutation(client, mutation);
          if (mutation.id !== undefined) await deleteQueueItem(mutation.id);
          emitStatus({ pending: Math.max(0, status.pending - 1) });
        }
        queued = await getQueue();
      }
      emitStatus({ lastError: null });
    } catch (error) {
      emitStatus({ lastError: error instanceof Error ? error.message : 'No se pudo sincronizar.' });
    } finally {
      emitStatus({ syncing: false, pending: (await getQueue()).length });
    }
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

export async function saveMutation(mutation: Omit<OfflineMutation, 'createdAt'>): Promise<'synced' | 'queued'> {
  await queueMutation(mutation);
  if (navigator.onLine) {
    await syncPendingMutations();
    return (await getQueue()).some((item) => item.dedupeKey === mutation.dedupeKey) ? 'queued' : 'synced';
  }
  return 'queued';
}

export function startOfflineSync() {
  if (listenersStarted || typeof window === 'undefined') return;
  listenersStarted = true;
  window.addEventListener('online', () => {
    emitStatus({ online: true });
    void syncPendingMutations();
  });
  window.addEventListener('offline', () => emitStatus({ online: false }));
  void getQueue().then((queue) => emitStatus({ pending: queue.length }));
}

export const cacheKeys = {
  profile: (userId: string) => `profile:${userId}`,
  daily: (userId: string, date: string) => `daily:${userId}:${date}`,
  dailyList: (userId: string) => `daily-list:${userId}`,
  routines: (userId: string) => `routines:${userId}`,
  sessions: (userId: string) => `sessions:${userId}`,
  workoutSession: (sessionId: string) => `workout-session:${sessionId}`,
  exerciseLibrary: 'exercise-library'
};

export async function cacheProfile(profile: Profile): Promise<void> {
  await setCached(cacheKeys.profile(profile.id), profile);
}

export async function cacheDailyLog(log: DailyLog): Promise<void> {
  await setCached(cacheKeys.daily(log.user_id, log.log_date), log);
  const list = (await getCached<DailyLog[]>(cacheKeys.dailyList(log.user_id))) ?? [];
  const next = [...list.filter((item) => item.log_date !== log.log_date), log].sort((a, b) => a.log_date.localeCompare(b.log_date));
  await setCached(cacheKeys.dailyList(log.user_id), next);
}

export async function cacheDailyLogs(userId: string, logs: DailyLog[]): Promise<void> {
  await setCached(cacheKeys.dailyList(userId), logs);
  await Promise.all(logs.map((log) => setCached(cacheKeys.daily(userId, log.log_date), log)));
}

export async function cacheSessionSummary(userId: string, summary: any): Promise<void> {
  const list = (await getCached<any[]>(cacheKeys.sessions(userId))) ?? [];
  const next = [summary, ...list.filter((item) => item.id !== summary.id)].sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)));
  await setCached(cacheKeys.sessions(userId), next);
}

export async function updateCachedRoutineExercise(userId: string, plannedId: string, exercise: any): Promise<void> {
  const routines = (await getCached<any[]>(cacheKeys.routines(userId))) ?? [];
  const next = routines.map((routine) => ({
    ...routine,
    routine_exercises: (routine.routine_exercises ?? []).map((item: any) => item.id === plannedId ? { ...item, exercise } : item)
  }));
  await setCached(cacheKeys.routines(userId), next);
}
