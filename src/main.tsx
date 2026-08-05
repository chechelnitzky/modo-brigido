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

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('No se encontró el contenedor principal de la aplicación.');
}

// La interfaz debe aparecer aunque Safari/iOS no soporte alguna API opcional.
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
  let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | undefined;

  applyUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      // Activa la versión nueva sin recargar la página actual. En iPhone, forzar
      // una recarga aquí puede mezclar el HTML antiguo con archivos JS/CSS nuevos.
      // La versión activada se usa de forma limpia en la próxima apertura.
      void applyUpdate?.(false).catch((error) => {
        console.warn('[Modo Brígido] No se pudo activar la actualización de la PWA.', error);
      });
    },
    onRegisteredSW(_serviceWorkerUrl, registration) {
      // Revisa la versión publicada cada vez que se abre la aplicación, pero no
      // fuerza una recarga mientras el usuario está dentro.
      void registration?.update().catch((error) => {
        console.warn('[Modo Brígido] No se pudo revisar la actualización de la PWA.', error);
      });
    }
  });
}

// Se inicia después del primer render para que una incompatibilidad del navegador
// nunca vuelva a dejar toda la aplicación en blanco.
window.setTimeout(() => {
  startOptionalFeature('PWA', () => registerProgressiveWebApp());
  startOptionalFeature('sincronización offline', () => startOfflineSync());
  startOptionalFeature('notificaciones del temporizador', () => startTimerNotificationLifecycle());
}, 0);
