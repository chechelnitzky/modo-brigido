import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { startOfflineSync } from './lib/offline';
import './styles.css';
import './offline.css';
import './features.css';
import './selected-date-exercises.css';

registerSW({ immediate: true });
startOfflineSync();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
