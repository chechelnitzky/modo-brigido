import { readFile, writeFile } from 'node:fs/promises';

const file = new URL('../src/pages/WorkoutSessionPageV2.tsx', import.meta.url);
let source = await readFile(file, 'utf8');

if (source.includes('REST_DURATION_STORAGE_KEY')) {
  console.log('Adjustable timer already applied.');
  process.exit(0);
}

function replaceExact(find, replacement, label) {
  if (!source.includes(find)) {
    throw new Error(`Could not patch ${label}: expected source was not found.`);
  }
  source = source.replace(find, replacement);
}

replaceExact(
  "import { ArrowLeft, BellRing, Check, CheckCircle2, CloudOff, Dumbbell, Pause, Play, RefreshCw, RotateCcw, Save, Search, TimerReset } from 'lucide-react';",
  "import { ArrowLeft, BellRing, Check, CheckCircle2, CloudOff, Dumbbell, Minus, Pause, Play, Plus, RefreshCw, RotateCcw, Save, Search, TimerReset } from 'lucide-react';",
  'timer icons'
);

replaceExact(
  `const REST_SECONDS = 120;
type TimerState = { remaining: number; endAt: number | null; running: boolean; finished: boolean };`,
  `const DEFAULT_REST_SECONDS = 120;
const MIN_REST_SECONDS = 0;
const MAX_REST_SECONDS = 300;
const REST_STEP_SECONDS = 15;
const REST_DURATION_STORAGE_KEY = 'modo-brigido-rest-duration-seconds';
type TimerState = { remaining: number; endAt: number | null; running: boolean; finished: boolean };

function clampRestDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return DEFAULT_REST_SECONDS;
  return Math.max(MIN_REST_SECONDS, Math.min(MAX_REST_SECONDS, Math.round(seconds / REST_STEP_SECONDS) * REST_STEP_SECONDS));
}

function readStoredRestDuration() {
  if (typeof window === 'undefined') return DEFAULT_REST_SECONDS;
  return clampRestDuration(Number(localStorage.getItem(REST_DURATION_STORAGE_KEY) ?? DEFAULT_REST_SECONDS));
}`,
  'timer constants'
);

replaceExact(
  `  const [notificationPermission, setNotificationPermission] = useState<TimerNotificationPermission>(getTimerNotificationPermission());
  const [timer, setTimer] = useState<TimerState>({ remaining: REST_SECONDS, endAt: null, running: false, finished: false });`,
  `  const initialRestDuration = readStoredRestDuration();
  const [restDurationSeconds, setRestDurationSeconds] = useState(initialRestDuration);
  const [notificationPermission, setNotificationPermission] = useState<TimerNotificationPermission>(getTimerNotificationPermission());
  const [timer, setTimer] = useState<TimerState>({ remaining: initialRestDuration, endAt: null, running: false, finished: false });`,
  'timer state'
);

replaceExact(
  `      const parsed = JSON.parse(saved) as TimerState;
      if (parsed.running && parsed.endAt) {
        const remaining = Math.max(0, Math.ceil((parsed.endAt - Date.now()) / 1000));
        setTimer({ ...parsed, remaining, running: remaining > 0, finished: remaining === 0 });
        if (remaining === 0 && alertedEndAtRef.current !== parsed.endAt) {
          alertedEndAtRef.current = parsed.endAt;
          void triggerTimerFinishedAlert(session?.routine?.name);
        }
      } else {
        setTimer(parsed);
      }`,
  `      const parsed = JSON.parse(saved) as TimerState;
      if (parsed.running && parsed.endAt) {
        const remaining = Math.max(0, Math.ceil((parsed.endAt - Date.now()) / 1000));
        setTimer({ ...parsed, remaining, running: remaining > 0, finished: remaining === 0 });
        if (remaining === 0 && alertedEndAtRef.current !== parsed.endAt) {
          alertedEndAtRef.current = parsed.endAt;
          void triggerTimerFinishedAlert(session?.routine?.name);
        }
      } else {
        setTimer({ ...parsed, remaining: parsed.finished ? 0 : restDurationSeconds });
      }`,
  'stored timer restoration'
);

replaceExact(
  `  const startTimer = (seconds = REST_SECONDS) => {
    void prepareTimerAlerts();
    alertedEndAtRef.current = null;
    setTimer({ remaining: seconds, endAt: Date.now() + seconds * 1000, running: true, finished: false });
  };

  const toggleTimer = () => {
    if (timer.running) {
      const remaining = timer.endAt ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining;
      setTimer({ remaining, endAt: null, running: false, finished: false });
    } else {
      startTimer(timer.remaining > 0 ? timer.remaining : REST_SECONDS);
    }
  };

  const resetTimer = () => {
    alertedEndAtRef.current = null;
    setTimer({ remaining: REST_SECONDS, endAt: null, running: false, finished: false });
  };

  const enableNotifications = async () => {`,
  `  const startTimer = (seconds = restDurationSeconds) => {
    const duration = clampRestDuration(seconds);
    void prepareTimerAlerts();
    alertedEndAtRef.current = null;
    if (duration === 0) {
      setTimer({ remaining: 0, endAt: null, running: false, finished: true });
      window.setTimeout(() => { void triggerTimerFinishedAlert(session?.routine?.name); }, 0);
      return;
    }
    setTimer({ remaining: duration, endAt: Date.now() + duration * 1000, running: true, finished: false });
  };

  const toggleTimer = () => {
    if (timer.running) {
      const remaining = timer.endAt ? Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000)) : timer.remaining;
      setTimer({ remaining, endAt: null, running: false, finished: false });
    } else {
      startTimer(timer.finished ? restDurationSeconds : timer.remaining);
    }
  };

  const resetTimer = () => {
    alertedEndAtRef.current = null;
    setTimer({ remaining: restDurationSeconds, endAt: null, running: false, finished: false });
  };

  const adjustRestDuration = (change: number) => {
    if (timer.running) return;
    const next = clampRestDuration(restDurationSeconds + change);
    setRestDurationSeconds(next);
    localStorage.setItem(REST_DURATION_STORAGE_KEY, String(next));
    alertedEndAtRef.current = null;
    setTimer({ remaining: next, endAt: null, running: false, finished: false });
  };

  const enableNotifications = async () => {`,
  'timer controls'
);

replaceExact(
  `      <section className={timer.finished ? 'panel rest-timer finished' : timer.running ? 'panel rest-timer running' : 'panel rest-timer'}>
        <div className="rest-timer-copy">
          <div className="metric-icon"><TimerReset /></div>
          <div><p className="eyebrow">DESCANSO ENTRE SERIES</p><h2>{timer.finished ? '¡Listo, siguiente serie!' : 'Timer de 2 minutos'}</h2><p className="muted">Ding y vibración al terminar. Activa avisos para recibir una notificación en segundo plano.</p></div>
        </div>
        <div className="rest-timer-clock"><strong>{formatTimer(timer.remaining)}</strong><span>{timer.running ? 'corriendo' : timer.finished ? 'terminado' : 'preparado'}</span></div>
        <div className="rest-timer-actions">
          <button className="primary-button compact" onClick={toggleTimer}>{timer.running ? <Pause size={16} /> : <Play size={16} />} {timer.running ? 'Pausar' : timer.remaining < REST_SECONDS && timer.remaining > 0 ? 'Continuar' : 'Iniciar'}</button>
          <button className="secondary-button compact" onClick={resetTimer}><RotateCcw size={16} /> Reiniciar</button>`,
  `      <section className={timer.finished ? 'panel rest-timer finished' : timer.running ? 'panel rest-timer running' : 'panel rest-timer'}>
        <div className="rest-timer-copy">
          <div className="metric-icon"><TimerReset /></div>
          <div><p className="eyebrow">DESCANSO ENTRE SERIES</p><h2>{timer.finished ? '¡Listo, siguiente serie!' : \`Timer de \${formatTimer(restDurationSeconds)}\`}</h2><p className="muted">Ajusta entre 0 y 5 minutos. Los botones cambian 15 segundos por toque y la duración queda guardada.</p></div>
        </div>
        <div className="rest-timer-clock"><strong>{formatTimer(timer.remaining)}</strong><span>{timer.running ? 'corriendo' : timer.finished ? 'terminado' : 'preparado'}</span></div>
        <div className="rest-timer-actions">
          <button className="secondary-button compact" onClick={() => adjustRestDuration(-REST_STEP_SECONDS)} disabled={timer.running || restDurationSeconds <= MIN_REST_SECONDS} aria-label="Bajar 15 segundos"><Minus size={16} /> 15 s</button>
          <span className="status-chip green">Duración {formatTimer(restDurationSeconds)}</span>
          <button className="secondary-button compact" onClick={() => adjustRestDuration(REST_STEP_SECONDS)} disabled={timer.running || restDurationSeconds >= MAX_REST_SECONDS} aria-label="Subir 15 segundos"><Plus size={16} /> 15 s</button>
          <button className="primary-button compact" onClick={toggleTimer}>{timer.running ? <Pause size={16} /> : <Play size={16} />} {timer.running ? 'Pausar' : !timer.finished && timer.remaining < restDurationSeconds ? 'Continuar' : 'Iniciar'}</button>
          <button className="secondary-button compact" onClick={resetTimer}><RotateCcw size={16} /> Reiniciar</button>`,
  'timer interface'
);

await writeFile(file, source);
console.log('Adjustable timer applied: 0:00–5:00 in 15-second steps.');
