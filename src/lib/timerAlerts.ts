// @ts-nocheck
import {
  acknowledgeDueTimerPushes,
  cancelCurrentTimerPush,
  ensurePushSubscription,
  reconcileTimerPushJob,
  schedulePushForActiveTimer,
  schedulePushForTimer
} from './pushNotifications';

let audioContext: AudioContext | null = null;
let lifecycleStarted = false;
let reconcileInterval: number | null = null;

const AGGRESSIVE_VIBRATION = [450, 110, 450, 110, 850, 160, 450, 110, 450, 110, 1100];

export type TimerNotificationPermission = NotificationPermission | 'unsupported';
export type TimerAlertSchedule = { endAt: number; sessionId?: string; routineName?: string };

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

function playAlarmSequence() {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') void context.resume();
  const now = context.currentTime + 0.02;
  const notes = [
    [0.00, 1400, 0.32], [0.36, 700, 0.34], [0.76, 1400, 0.32],
    [1.12, 700, 0.34], [1.52, 1750, 0.68]
  ] as const;
  for (const [offset, frequency, duration] of notes) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, now + offset);
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.45, now + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + duration);
  }
}

export function getTimerNotificationPermission(): TimerNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function prepareTimerAlerts(schedule?: TimerAlertSchedule): Promise<void> {
  const context = getAudioContext();
  if (context?.state === 'suspended') await context.resume();

  if (schedule) {
    await schedulePushForTimer(schedule);
    return;
  }

  // WorkoutSession guarda el endAt inmediatamente después de llamar esta función.
  // Esperamos brevemente y tomamos ese valor para agendar el push directo una sola vez.
  window.setTimeout(() => { void schedulePushForActiveTimer(); }, 280);
}

export async function cancelScheduledTimerAlert(): Promise<void> {
  await cancelCurrentTimerPush();
}

export async function requestTimerNotificationPermission(): Promise<TimerNotificationPermission> {
  const context = getAudioContext();
  if (context?.state === 'suspended') await context.resume();
  if (!('Notification' in window)) return 'unsupported';
  const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission === 'granted') await ensurePushSubscription();
  return permission;
}

export async function clearTimerNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications();
    notifications.filter((notification) => notification.tag.startsWith('modo-brigido-rest')).forEach((notification) => notification.close());
  } catch { /* sin acción */ }
}

export function stopPersistentTimerAlarm(): void {
  if ('vibrate' in navigator) navigator.vibrate(0);
  void clearTimerNotifications();
  void acknowledgeDueTimerPushes();
}

export function startTimerNotificationLifecycle(): void {
  if (lifecycleStarted || typeof window === 'undefined') return;
  lifecycleStarted = true;
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void acknowledgeDueTimerPushes();
      void clearTimerNotifications();
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('online', () => { void ensurePushSubscription(); void reconcileTimerPushJob(); });
  reconcileInterval = window.setInterval(() => { void reconcileTimerPushJob(); }, 2500);
  if (Notification.permission === 'granted') void ensurePushSubscription();
  onVisible();
}

export async function triggerTimerFinishedAlert(): Promise<void> {
  if (document.visibilityState === 'visible') {
    playAlarmSequence();
    if ('vibrate' in navigator) navigator.vibrate(AGGRESSIVE_VIBRATION);
    return;
  }
  // El push del servidor es la vía principal cuando la app está cerrada o la pantalla apagada.
  // Este fallback ayuda si Android todavía mantiene viva la PWA.
  playAlarmSequence();
  if ('vibrate' in navigator) navigator.vibrate(AGGRESSIVE_VIBRATION);
}
