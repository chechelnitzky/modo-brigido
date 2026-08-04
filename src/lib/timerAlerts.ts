let audioContext: AudioContext | null = null;
let fallbackNotification: Notification | null = null;
let lifecycleStarted = false;
let alarmInterval: number | null = null;
let alarmRoutineName = '';
let alarmPulseCount = 0;

const TIMER_NOTIFICATION_TAG = 'modo-brigido-rest-timer';
const TIMER_ALARM_ACTIVE_KEY = 'modo-brigido-timer-alarm-active';
const TIMER_ALARM_ROUTINE_KEY = 'modo-brigido-timer-alarm-routine';
const ALARM_REPEAT_MS = 3200;

export type TimerNotificationPermission = NotificationPermission | 'unsupported';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

export function getTimerNotificationPermission(): TimerNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function prepareTimerAlerts(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') await context.resume();

  // Desbloquea el audio móvil desde un gesto del usuario, sin producir sonido audible.
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.00001, context.currentTime);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.01);
}

export async function requestTimerNotificationPermission(): Promise<TimerNotificationPermission> {
  await prepareTimerAlerts();
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  return Notification.requestPermission();
}

function scheduleBellNote(context: AudioContext, startAt: number, frequency: number, duration: number, volume: number) {
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  const fundamental = context.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(frequency, startAt);
  fundamental.connect(gain);
  fundamental.start(startAt);
  fundamental.stop(startAt + duration);

  const overtone = context.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.setValueAtTime(frequency * 2.01, startAt);
  const overtoneGain = context.createGain();
  overtoneGain.gain.setValueAtTime(0.12, startAt);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration * 0.72);
  overtone.connect(overtoneGain);
  overtoneGain.connect(context.destination);
  overtone.start(startAt);
  overtone.stop(startAt + duration);
}

async function playTimerChime(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const now = context.currentTime + 0.03;
  const notes = [
    { offset: 0.00, frequency: 1046.5, duration: 0.34, volume: 0.34 },
    { offset: 0.34, frequency: 659.25, duration: 0.38, volume: 0.31 },
    { offset: 0.76, frequency: 1046.5, duration: 0.34, volume: 0.34 },
    { offset: 1.10, frequency: 659.25, duration: 0.38, volume: 0.31 },
    { offset: 1.52, frequency: 1174.66, duration: 0.58, volume: 0.38 }
  ];

  for (const note of notes) {
    scheduleBellNote(context, now + note.offset, note.frequency, note.duration, note.volume);
  }
}

export async function clearTimerNotifications(): Promise<void> {
  fallbackNotification?.close();
  fallbackNotification = null;

  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const notifications = await registration.getNotifications({ tag: TIMER_NOTIFICATION_TAG });
    for (const notification of notifications) notification.close();
  } catch (error) {
    console.warn('No se pudo cerrar la notificación del timer.', error);
  }
}

async function showBackgroundNotification(routineName?: string, pulse = 1): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  const title = '⏱️ ¡Descanso terminado!';
  const options: NotificationOptions = {
    body: routineName
      ? `${routineName}: vuelve para hacer la siguiente serie. Alarma ${pulse}.`
      : `Vuelve para hacer la siguiente serie. Alarma ${pulse}.`,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    tag: TIMER_NOTIFICATION_TAG,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: [180, 90, 180, 220, 180, 90, 180, 220, 260],
    timestamp: Date.now(),
    actions: [{ action: 'open-timer', title: 'Abrir timer' }],
    data: { url: window.location.href }
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    }
    fallbackNotification?.close();
    fallbackNotification = new Notification(title, options);
  } catch (error) {
    console.warn('No se pudo mostrar la notificación del timer.', error);
  }
}

async function runAlarmPulse(): Promise<void> {
  if (document.visibilityState === 'visible') {
    stopPersistentTimerAlarm();
    return;
  }

  alarmPulseCount += 1;
  await playTimerChime();
  if ('vibrate' in navigator) navigator.vibrate([180, 90, 180, 220, 180, 90, 180, 220, 260]);
  await showBackgroundNotification(alarmRoutineName, alarmPulseCount);
}

function startPersistentTimerAlarm(routineName?: string): void {
  alarmRoutineName = routineName ?? '';
  alarmPulseCount = 0;
  localStorage.setItem(TIMER_ALARM_ACTIVE_KEY, '1');
  localStorage.setItem(TIMER_ALARM_ROUTINE_KEY, alarmRoutineName);

  if (alarmInterval !== null) window.clearInterval(alarmInterval);
  void runAlarmPulse();
  alarmInterval = window.setInterval(() => { void runAlarmPulse(); }, ALARM_REPEAT_MS);
}

export function stopPersistentTimerAlarm(): void {
  if (alarmInterval !== null) {
    window.clearInterval(alarmInterval);
    alarmInterval = null;
  }
  alarmPulseCount = 0;
  alarmRoutineName = '';
  localStorage.removeItem(TIMER_ALARM_ACTIVE_KEY);
  localStorage.removeItem(TIMER_ALARM_ROUTINE_KEY);
  if ('vibrate' in navigator) navigator.vibrate(0);
  void clearTimerNotifications();
}

export function startTimerNotificationLifecycle(): void {
  if (lifecycleStarted || typeof window === 'undefined') return;
  lifecycleStarted = true;

  const stopWhenAppIsVisible = () => {
    if (document.visibilityState === 'visible') stopPersistentTimerAlarm();
  };

  document.addEventListener('visibilitychange', stopWhenAppIsVisible);
  window.addEventListener('focus', stopWhenAppIsVisible);

  if (document.visibilityState === 'visible') {
    stopPersistentTimerAlarm();
  } else if (localStorage.getItem(TIMER_ALARM_ACTIVE_KEY) === '1') {
    startPersistentTimerAlarm(localStorage.getItem(TIMER_ALARM_ROUTINE_KEY) ?? undefined);
  }
}

export async function triggerTimerFinishedAlert(routineName?: string): Promise<void> {
  if (document.visibilityState === 'visible') {
    await playTimerChime();
    if ('vibrate' in navigator) navigator.vibrate([180, 90, 180, 220, 260]);
    return;
  }

  startPersistentTimerAlarm(routineName);
}
