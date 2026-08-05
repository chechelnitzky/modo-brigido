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

// Se inicia después del primer render para que una incompatibilidad del navegador
// nunca vuelva a dejar toda la aplicación en blanco.
window.setTimeout(() => {
  startOptionalFeature('PWA', () => registerSW({ immediate: true }));
  startOptionalFeature('sincronización offline', () => startOfflineSync());
  startOptionalFeature('notificaciones del temporizador', () => startTimerNotificationLifecycle());
}, 0);
