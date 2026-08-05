// @ts-nocheck
import { getSupabase } from './supabase';

const CURRENT_JOB_KEY = 'modo-brigido-current-push-job';
const VAPID_PUBLIC_KEY = 'BHd7QItp7kI1of4vXLlexXtPU2GMKI5uhPnnjWClsOgVBA3utDHRtK42x8CQy6nYlHQEKZFDOcxqrx5MIFEcHr0';

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const bytes = Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function ensurePushSubscription(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return false;
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

export async function schedulePushForActiveTimer(routineName?: string): Promise<void> {
  if (!navigator.onLine || Notification.permission !== 'granted') return;
  await ensurePushSubscription();
  await new Promise((resolve) => window.setTimeout(resolve, 220));
  const timer = findRunningTimer();
  if (!timer) return;
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const previousJobId = localStorage.getItem(CURRENT_JOB_KEY);
  if (previousJobId) {
    await supabase.from('timer_push_jobs').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', previousJobId).eq('user_id', user.id);
  }
  const dueAt = new Date(timer.endAt).toISOString();
  const { data, error } = await supabase.from('timer_push_jobs').insert({
    user_id: user.id,
    workout_session_id: timer.sessionId && timer.sessionId !== 'unknown' ? timer.sessionId : null,
    due_at: dueAt,
    next_attempt_at: dueAt,
    title: '¡Descanso terminado!',
    body: routineName ? `${routineName}: vuelve ahora para la siguiente serie.` : 'Vuelve ahora para la siguiente serie.'
  }).select('id').single();
  if (!error && data?.id) localStorage.setItem(CURRENT_JOB_KEY, data.id);
}

export async function reconcileTimerPushJob(): Promise<void> {
  if (!navigator.onLine) return;
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
  if (!navigator.onLine) return;
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const now = new Date().toISOString();
  await supabase.from('timer_push_jobs').update({ status: 'acknowledged', acknowledged_at: now, updated_at: now })
    .eq('user_id', user.id).is('acknowledged_at', null).is('cancelled_at', null).lte('due_at', now);
  localStorage.removeItem(CURRENT_JOB_KEY);
}
