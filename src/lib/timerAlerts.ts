let audioContext: AudioContext | null = null;

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

async function playTimerDing(): Promise<void> {
  const context = getAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    try {
      await context.resume();
    } catch {
      return;
    }
  }

  const now = context.currentTime;
  const gain = context.createGain();
  gain.connect(context.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.34, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

  const first = context.createOscillator();
  first.type = 'sine';
  first.frequency.setValueAtTime(880, now);
  first.connect(gain);
  first.start(now);
  first.stop(now + 0.26);

  const second = context.createOscillator();
  second.type = 'sine';
  second.frequency.setValueAtTime(1174.66, now + 0.22);
  second.connect(gain);
  second.start(now + 0.22);
  second.stop(now + 0.62);
}

async function showBackgroundNotification(routineName?: string): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  const title = '¡Descanso terminado!';
  const options: NotificationOptions = {
    body: routineName ? `${routineName}: es hora de la siguiente serie.` : 'Es hora de la siguiente serie.',
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    tag: 'modo-brigido-rest-timer',
    data: { url: window.location.href }
  };

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch (error) {
    console.warn('No se pudo mostrar la notificación del timer.', error);
  }
}

export async function triggerTimerFinishedAlert(routineName?: string): Promise<void> {
  await playTimerDing();
  if ('vibrate' in navigator) navigator.vibrate(180);
  await showBackgroundNotification(routineName);
}
