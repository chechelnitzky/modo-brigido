import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { startOfflineSync } from './lib/offline';
import { startTimerNotificationLifecycle } from './lib/timerAlerts';
import './styles.css';
import './offline.css';
import './features.css';
import './selected-date-exercises.css';
import './bodyfat-gauge.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de la aplicación.');
}

createRoot(rootElement).render(<StrictMode><App /></StrictMode>);
(window as Window & { __MODO_BRIGIDO_BOOTED__?: boolean }).__MODO_BRIGIDO_BOOTED__ = true;

function startOptionalFeature(name: string, start: () => unknown): void {
  try {
    const result = start();
    if (result instanceof Promise) {
      void result.catch((error) => console.warn(`[Modo Brígido] ${name} no pudo iniciarse.`, error));
    }
  } catch (error) {
    console.warn(`[Modo Brígido] ${name} no pudo iniciarse.`, error);
  }
}

function registerProgressiveWebApp(): void {
  const reloadKey = 'modo-brigido-update-reload';
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;
  let reloading = false;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading || sessionStorage.getItem(reloadKey) === '1') return;
      reloading = true;
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    });
  }

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      void updateSW?.(false).catch((error) => {
        console.warn('[Modo Brígido] No se pudo activar la actualización de la PWA.', error);
      });
    },
    onRegisteredSW(_serviceWorkerUrl, registration) {
      void registration?.update().catch((error) => {
        console.warn('[Modo Brígido] No se pudo revisar la actualización de la PWA.', error);
      });
    }
  });

  window.setTimeout(() => sessionStorage.removeItem(reloadKey), 15000);
}

window.setTimeout(() => {
  startOptionalFeature('PWA', () => registerProgressiveWebApp());
  startOptionalFeature('sincronización offline', () => startOfflineSync());
  startOptionalFeature('notificaciones del temporizador', () => startTimerNotificationLifecycle());
}, 0);
