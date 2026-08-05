// @ts-nocheck
import { getSupabase } from './supabase';

const CURRENT_JOB_KEY = 'modo-brigido-current-push-job';
const VAPID_PUBLIC_KEY = 'BHd7QItp7kI1of4vXLlexXtPU2GMKI5uhPnnjWClsOgVBA3utDHRtK42x8CQy6nYlHQEKZFDOcxqrx5MIFEcHr0';

type TimerPushSchedule = {
  endAt: number;
  sessionId?: string;
  routineName?: string;
};

function supportsNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && typeof window.Notification !== 'undefined';
}

function canUsePush(): boolean {
  return typeof window !== 'undefined'
    && typeof navigator !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && supportsNotifications()
    && window.Notification.permission === 'granted';
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function ensurePushSubscription(): Promise<boolean> {
  if (!canUsePush()) return false;
  try {
    const supabase = getSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(VAPID_PUBLIC_KEY)
      });
    }
    const serialized = subscription.toJSON();
    if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) return false;
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: user.id,
      endpoint: serialized.endpoint,
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString()
    }, { onConflict: 'endpoint' });
    return !error;
  } catch {
    return false;
  }
}

function findRunningTimer(): { endAt: number; sessionId?: string } | null {
  let candidate: { endAt: number; sessionId?: string } | null = null;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith('modo-brigido-rest-timer:')) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (!parsed.running || !parsed.endAt || parsed.endAt <= Date.now()) continue;
      if (!candidate || parsed.endAt < candidate.endAt) candidate = { endAt: Number(parsed.endAt), sessionId: key.split(':').pop() };
    } catch { /* ignorar */ }
  }
  return candidate;
}

async function cancelActiveJobsForUser(userId: string): Promise<void> {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  await supabase.from('timer_push_jobs').update({
    status: 'cancelled',
    cancelled_at: now,
    updated_at: now
  })
    .eq('user_id', userId)
    .is('acknowledged_at', null)
    .is('cancelled_at', null)
    .in('status', ['pending', 'sending']);
}

export async function cancelCurrentTimerPush(): Promise<void> {
  localStorage.removeItem(CURRENT_JOB_KEY);
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await cancelActiveJobsForUser(user.id);
}

export async function schedulePushForTimer({ endAt, sessionId, routineName }: TimerPushSchedule): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine || !canUsePush() || endAt <= Date.now()) return;
  const subscribed = await ensurePushSubscription();
  if (!subscribed) return;

  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await cancelActiveJobsForUser(user.id);
  localStorage.removeItem(CURRENT_JOB_KEY);

  const dueAt = new Date(endAt).toISOString();
  const { data, error } = await supabase.from('timer_push_jobs').insert({
    user_id: user.id,
    workout_session_id: sessionId && sessionId !== 'unknown' ? sessionId : null,
    due_at: dueAt,
    next_attempt_at: dueAt,
    title: '¡Descanso terminado!',
    body: routineName ? `${routineName}: vuelve ahora para la siguiente serie.` : 'Vuelve ahora para la siguiente serie.'
  }).select('id').single();

  if (error || !data?.id) return;
  localStorage.setItem(CURRENT_JOB_KEY, data.id);

  // La función directa queda esperando en Supabase y dispara el primer push al vencimiento.
  // El cron de 10 segundos permanece únicamente como respaldo.
  await supabase.functions.invoke('schedule-timer-push', { body: { jobId: data.id } });
}

export async function schedulePushForActiveTimer(routineName?: string): Promise<void> {
  const timer = findRunningTimer();
  if (!timer) return;
  await schedulePushForTimer({ ...timer, routineName });
}

export async function reconcileTimerPushJob(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  const jobId = localStorage.getItem(CURRENT_JOB_KEY);
  if (!jobId || findRunningTimer()) return;
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const now = new Date().toISOString();
  await supabase.from('timer_push_jobs').update({ status: 'acknowledged', acknowledged_at: now, updated_at: now }).eq('id', jobId).eq('user_id', user.id);
  localStorage.removeItem(CURRENT_JOB_KEY);
}

export async function acknowledgeDueTimerPushes(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine) return;
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const now = new Date().toISOString();
  await supabase.from('timer_push_jobs').update({ status: 'acknowledged', acknowledged_at: now, updated_at: now })
    .eq('user_id', user.id).is('acknowledged_at', null).is('cancelled_at', null).lte('due_at', now);
  localStorage.removeItem(CURRENT_JOB_KEY);
}
