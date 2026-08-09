import { getSupabase } from './supabase';

export type PacerStatus = {
  configured: boolean;
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
};

export type PacerActivity = {
  activity_date: string;
  steps: number;
};

type PacerStartResult = { authorizeUrl: string };
export type PacerSyncResult = {
  configured: boolean;
  connected: boolean;
  synced?: number;
  lastSyncAt?: string;
  activities?: PacerActivity[];
};

async function invokePacer<T>(body: Record<string, unknown>): Promise<T> {
  const supabase = getSupabase();
  const { data, error } = await supabase.functions.invoke('pacer-integration', { body });
  if (error) throw new Error(error.message || 'No se pudo comunicar con Pacer.');
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function getPacerStatus() {
  return invokePacer<PacerStatus>({ action: 'status' });
}

export function startPacerConnection() {
  return invokePacer<PacerStartResult>({ action: 'start' });
}

export function syncPacerSteps(days = 31) {
  return invokePacer<PacerSyncResult>({ action: 'sync', days });
}

export function disconnectPacer() {
  return invokePacer<{ connected: false }>({ action: 'disconnect' });
}
