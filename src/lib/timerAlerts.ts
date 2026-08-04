let audioContext: AudioContext | null = null;
let fallbackNotification: Notification | null = null;
let alarmAudio: HTMLAudioElement | null = null;
let alarmAudioUrl: string | null = null;
let lifecycleStarted = false;
let alarmInterval: number | null = null;
let alarmRoutineName = '';
let alarmPulseCount = 0;

const TIMER_NOTIFICATION_TAG = 'modo-brigido-rest-timer';
const TIMER_ALARM_ACTIVE_KEY = 'modo-brigido-timer-alarm-active';
const TIMER_ALARM_ROUTINE_KEY = 'modo-brigido-timer-alarm-routine';
const ALARM_REPEAT_MS = 4200;
const AGGRESSIVE_VIBRATION = [450, 110, 450, 110, 850, 160, 450, 110, 450, 110, 1100];

export type TimerNotificationPermission = NotificationPermission | 'unsupported';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  return audioContext;
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function createAggressiveAlarmWav(): Blob {
  const sampleRate = 11025;
  const duration = 2.6;
  const sampleCount = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + sampleCount);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, sampleCount, true);

  const bursts = [
    { start: 0.00, duration: 0.34, frequency: 1400 },
    { start: 0.38, duration: 0.34, frequency: 700 },
    { start: 0.78, duration: 0.34, frequency: 1400 },
    { start: 1.16, duration: 0.34, frequency: 700 },
    { start: 1.56, duration: 0.72, frequency: 1750 }
  ];

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    let value = 0;

    for (const burst of bursts) {
      if (time < burst.start || time >= burst.start + burst.duration) continue;
      const progress = (time - burst.start) / burst.duration;
      const envelope = Math.min(1, progress / 0.015, (1 - progress) / 0.08);
      const phase = 2 * Math.PI * burst.frequency * time;
      const signal =
        0.55 * Math.sin(phase) +
        0.30 * Math.sin(phase * 2.02) +
        0.22 * Math.sin(phase * 3.01) +
        0.12 * Math.sin(phase * 0.5) +
        0.18 * (Math.sin(phase) >= 0 ? 1 : -1);
      value += envelope * signal;
    }

    const clipped = Math.tanh(value * 2.2);
    view.setUint8(44 + index, Math.max(0, Math.min(255, Math.round((clipped + 1) * 127.5))));
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function getAlarmAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (alarmAudio) return alarmAudio;

  alarmAudioUrl = URL.createObjectURL(createAggressiveAlarmWav());
  alarmAudio = new Audio(alarmAudioUrl);
  alarmAudio.preload = 'auto';
  alarmAudio.loop = true;
  alarmAudio.volume = 1;
  alarmAudio.setAttribute('playsinline', 'true');
  return alarmAudio;
}

function configureMediaSession(routineName?: string) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: '¡Descanso terminado!',
      artist: routineName ? `Modo Brígido · ${routineName}` : 'Modo Brígido',
      album: 'Vuelve a la siguiente serie',
      artwork: [
        { src: `${import.meta.env.BASE_URL}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${import.meta.env.BASE_URL}icon-512.png`, sizes: '512x512', type: 'image/png' }
      ]
    });
    navigator.mediaSession.playbackState = 'playing';
    navigator.mediaSession.setActionHandler('pause', () => stopPersistentTimerAlarm());
    navigator.mediaSession.setActionHandler('stop', () => stopPersistentTimerAlarm());
  } catch {
    // Algunos navegadores exponen Media Session parcialmente.
  }
}

function clearMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.playbackState = 'none';
    navigator.mediaSession.metadata = null;
  } catch {
    // Sin acción: es una mejora opcional de Android.
  }
}

export function getTimerNotificationPermission(): TimerNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

async function primeAlarmAudio(): Promise<void> {
  const audio = getAlarmAudio();
  if (!audio) return;

  const originalVolume = audio.volume;
  audio.volume = 0;
  audio.currentTime = 0;
  try {
    await audio.play();
    await new Promise((resolve) => window.setTimeout(resolve, 45));
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // El Web Audio de respaldo igualmente se prepara más abajo.
  } finally {
    audio.volume = originalVolume || 1;
  }
}

export async function prepareTimerAlerts(): Promise<void> {
  await primeAlarmAudio();

  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') await context.resume();

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
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  const fundamental = context.createOscillator();
  fundamental.type = 'square';
  fundamental.frequency.setValueAtTime(frequency, startAt);
  fundamental.connect(gain);
  fundamental.start(startAt);
  fundamental.stop(startAt + duration);

  const overtone = context.createOscillator();
  overtone.type = 'sawtooth';
  overtone.frequency.setValueAtTime(frequency * 2.01, startAt);
  const overtoneGain = context.createGain();
  overtoneGain.gain.setValueAtTime(0.16, startAt);
  overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration * 0.75);
  overtone.connect(overtoneGain);
  overtoneGain.connect(context.destination);
  overtone.start(startAt);
  overtone.stop(startAt + duration);
}

async function playWebAudioFallback(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const now = context.currentTime + 0.02;
  const notes = [
    { offset: 0.00, frequency: 1400, duration: 0.32, volume: 0.42 },
    { offset: 0.36, frequency: 700, duration: 0.34, volume: 0.40 },
    { offset: 0.76, frequency: 1400, duration: 0.32, volume: 0.42 },
    { offset: 1.12, frequency: 700, duration: 0.34, volume: 0.40 },
    { offset: 1.52, frequency: 1750, duration: 0.68, volume: 0.48 }
  ];
  for (const note of notes) scheduleBellNote(context, now + note.offset, note.frequency, note.duration, note.volume);
}

async function startAggressiveAlarmAudio(routineName?: string): Promise<boolean> {
  const audio = getAlarmAudio();
  if (!audio) return false;
  audio.loop = true;
  audio.volume = 1;
  audio.muted = false;
  audio.currentTime = 0;
  configureMediaSession(routineName);
  try {
    await audio.play();
    return true;
  } catch {
    clearMediaSession();
    return false;
  }
}

function stopAggressiveAlarmAudio() {
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
  }
  clearMediaSession();
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

  const title = '🚨 ¡DESCANSO TERMINADO!';
  const options: NotificationOptions = {
    body: routineName
      ? `${routineName}: vuelve ahora para la siguiente serie. Alarma ${pulse}.`
      : `Vuelve ahora para la siguiente serie. Alarma ${pulse}.`,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    tag: TIMER_NOTIFICATION_TAG,
    renotify: true,
    requireInteraction: true,
    silent: false,
    vibrate: AGGRESSIVE_VIBRATION,
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
  if ('vibrate' in navigator) navigator.vibrate(AGGRESSIVE_VIBRATION);
  await showBackgroundNotification(alarmRoutineName, alarmPulseCount);

  if (!alarmAudio || alarmAudio.paused) {
    const playing = await startAggressiveAlarmAudio(alarmRoutineName);
    if (!playing) await playWebAudioFallback();
  }
}

function startPersistentTimerAlarm(routineName?: string): void {
  alarmRoutineName = routineName ?? '';
  alarmPulseCount = 0;
  localStorage.setItem(TIMER_ALARM_ACTIVE_KEY, '1');
  localStorage.setItem(TIMER_ALARM_ROUTINE_KEY, alarmRoutineName);

  if (alarmInterval !== null) window.clearInterval(alarmInterval);
  void startAggressiveAlarmAudio(alarmRoutineName).then((playing) => {
    if (!playing) void playWebAudioFallback();
  });
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
  stopAggressiveAlarmAudio();
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
    const playing = await startAggressiveAlarmAudio(routineName);
    if (!playing) await playWebAudioFallback();
    if ('vibrate' in navigator) navigator.vibrate(AGGRESSIVE_VIBRATION);
    window.setTimeout(() => stopAggressiveAlarmAudio(), 2700);
    return;
  }

  startPersistentTimerAlarm(routineName);
}
