import { readFile, writeFile } from 'node:fs/promises';

const workoutFile = new URL('../src/pages/WorkoutSessionPageV2.tsx', import.meta.url);
const cssFile = new URL('../src/exercise-library.css', import.meta.url);
let workout = await readFile(workoutFile, 'utf8');
let css = await readFile(cssFile, 'utf8');

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Progression upgrade failed: ${label}`);
  return source.replace(from, to);
}

if (!workout.includes('type LastSetPerformance')) {
  workout = replaceRequired(
    workout,
`type LastExerciseWeights = Record<string, number>;
type ExerciseHistoryMetric = {
  lastWeight: number;
  prWeight: number;
  prReps: number;
  estimatedOneRepMax: number;
  loadPrWeight: number;
  loadPrReps: number;
};`,
`type LastExerciseWeights = Record<string, number>;
type LastSetPerformance = { setNumber: number; weight: number; reps: number };
type ExerciseHistoryMetric = {
  lastWeight: number;
  prWeight: number;
  prReps: number;
  estimatedOneRepMax: number;
  loadPrWeight: number;
  loadPrReps: number;
  lastSets: LastSetPerformance[];
  lastSessionDate: string | null;
};`,
    'history metric type'
  );

  workout = replaceRequired(
    workout,
`function emptyHistoryMetric(lastWeight = 0): ExerciseHistoryMetric {
  return { lastWeight, prWeight: 0, prReps: 0, estimatedOneRepMax: 0, loadPrWeight: 0, loadPrReps: 0 };
}`,
`function emptyHistoryMetric(lastWeight = 0): ExerciseHistoryMetric {
  return { lastWeight, prWeight: 0, prReps: 0, estimatedOneRepMax: 0, loadPrWeight: 0, loadPrReps: 0, lastSets: [], lastSessionDate: null };
}`,
    'empty history metric'
  );

  workout = replaceRequired(
    workout,
`    estimatedOneRepMax: Number(value.estimatedOneRepMax) || 0,
    loadPrWeight: hasLoadPr ? Number(value.loadPrWeight) : prWeight,
    loadPrReps: hasLoadPr ? Number(value.loadPrReps) || 0 : prReps
  };`,
`    estimatedOneRepMax: Number(value.estimatedOneRepMax) || 0,
    loadPrWeight: hasLoadPr ? Number(value.loadPrWeight) : prWeight,
    loadPrReps: hasLoadPr ? Number(value.loadPrReps) || 0 : prReps,
    lastSets: Array.isArray(value.lastSets)
      ? value.lastSets.map((set: any) => ({ setNumber: Number(set.setNumber) || 0, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0 })).filter((set: LastSetPerformance) => set.setNumber > 0 && set.reps > 0)
      : [],
    lastSessionDate: typeof value.lastSessionDate === 'string' ? value.lastSessionDate : null
  };`,
    'normalize history metric'
  );

  workout = replaceRequired(
    workout,
`function bestSetMetric(workoutSets: any[], requireCompleted = true): ExerciseHistoryMetric {`,
`function completedSetSnapshots(workoutSets: any[]): LastSetPerformance[] {
  return [...(workoutSets ?? [])]
    .filter((set: any) => set.completed)
    .sort((a: any, b: any) => Number(a.set_number) - Number(b.set_number))
    .map((set: any) => ({ setNumber: Number(set.set_number), weight: Number(set.weight_kg), reps: Number(set.reps) }))
    .filter((set: LastSetPerformance) => Number.isFinite(set.weight) && set.weight >= 0 && Number.isFinite(set.reps) && set.reps > 0);
}

type ProgressionCue = { action: 'up' | 'hold' | 'down' | 'none'; label: string; reason: string };

function progressionCue(history: ExerciseHistoryMetric, targetSets: number, repMin: number, repMax: number): ProgressionCue {
  const requiredSets = Math.max(1, targetSets);
  const sets = history.lastSets.slice(0, requiredSets);
  if (!sets.length) return { action: 'none', label: 'SIN DATOS', reason: 'Completa una sesión para recibir una recomendación de carga.' };

  if (sets.some((set) => set.reps < repMin)) {
    return { action: 'down', label: 'BAJAR PESO', reason: `Al menos una serie quedó bajo el mínimo de ${repMin} reps.` };
  }

  if (sets.length < requiredSets) {
    return { action: 'hold', label: 'MANTENER', reason: `Faltan series completas: ${sets.length}/${requiredSets}. Repite la carga antes de cambiarla.` };
  }

  const firstWeight = sets[0].weight;
  const sameWeight = sets.every((set) => Math.abs(set.weight - firstWeight) < 0.001);
  const allAtTop = sets.every((set) => set.reps >= repMax);

  if (allAtTop && sameWeight) {
    return { action: 'up', label: 'SUBIR PESO', reason: `Completaste las ${requiredSets} series en ${repMax} reps o más con la misma carga.` };
  }

  if (allAtTop && !sameWeight) {
    return { action: 'hold', label: 'MANTENER', reason: 'Llegaste al tope de reps, pero cambiaste la carga entre series. Repítela estable antes de subir.' };
  }

  return { action: 'hold', label: 'MANTENER', reason: `Mantén la carga hasta llevar todas las series a ${repMax} reps.` };
}

function lastSessionSummary(history: ExerciseHistoryMetric, targetSets: number): string {
  const sets = history.lastSets.slice(0, Math.max(1, targetSets));
  if (!sets.length) return 'Sin sesión anterior';
  const sameWeight = sets.every((set) => Math.abs(set.weight - sets[0].weight) < 0.001);
  if (sameWeight) return `${formatWeightKg(sets[0].weight)} kg × ${sets.map((set) => set.reps).join(' / ')}`;
  return sets.map((set) => `${formatWeightKg(set.weight)} kg × ${set.reps}`).join(' · ');
}

function bestSetMetric(workoutSets: any[], requireCompleted = true): ExerciseHistoryMetric {`,
    'progression helpers'
  );

  workout = replaceRequired(
    workout,
`      if (!lastWeightResolved.has(key)) {
        result[key].lastWeight = lastCompletedWeight(workoutExercise.workout_sets ?? []);
        lastWeightResolved.add(key);
      }`,
`      if (!lastWeightResolved.has(key)) {
        result[key].lastWeight = lastCompletedWeight(workoutExercise.workout_sets ?? []);
        result[key].lastSets = completedSetSnapshots(workoutExercise.workout_sets ?? []);
        result[key].lastSessionDate = workoutSession.finished_at ?? null;
        lastWeightResolved.add(key);
      }`,
    'latest session snapshots'
  );

  workout = replaceRequired(
    workout,
`        estimatedOneRepMax: best.estimatedOneRepMax,
        loadPrWeight: best.loadPrWeight,
        loadPrReps: best.loadPrReps
      };`,
`        estimatedOneRepMax: best.estimatedOneRepMax,
        loadPrWeight: best.loadPrWeight,
        loadPrReps: best.loadPrReps,
        lastSets: completedSetSnapshots(exercise.workout_sets ?? []),
        lastSessionDate: nextSession.finished_at ?? new Date().toISOString()
      };`,
    'finished session history cache'
  );

  workout = replaceRequired(
    workout,
`          const history = mergeBestMetrics(historicalHistory, liveBest);
          const liveMetricAvailable = liveBest.estimatedOneRepMax > 0 || liveBest.loadPrWeight > 0;
          const loadPrDuplicatesE1rm = history.loadPrWeight === history.prWeight && history.loadPrReps === history.prReps;`,
`          const history = mergeBestMetrics(historicalHistory, liveBest);
          const liveMetricAvailable = liveBest.estimatedOneRepMax > 0 || liveBest.loadPrWeight > 0;
          const loadPrDuplicatesE1rm = history.loadPrWeight === history.prWeight && history.loadPrReps === history.prReps;
          const targetSets = Number(exercise.planned?.target_sets ?? exercise.workout_sets.length ?? 2);
          const repMin = Number(exercise.planned?.rep_min ?? 8);
          const repMax = Number(exercise.planned?.rep_max ?? 12);
          const progression = progressionCue(historicalHistory, targetSets, repMin, repMax);
          const previousSession = lastSessionSummary(historicalHistory, targetSets);`,
    'progression cue calculation'
  );

  workout = replaceRequired(
    workout,
`                  <small>Objetivo: {exercise.planned?.target_sets ?? exercise.workout_sets.length} × {exercise.planned?.rep_min ?? 8}–{exercise.planned?.rep_max ?? 12} · RIR {exercise.planned?.rir_target ?? 2}</small>
                  <small style={{ display: 'block', marginTop: 4 }}>Última vez: {lastWeightsLoading ? '…' : `${formatWeightKg(history.lastWeight)} kg`}</small>
                  <small style={{ display: 'block', marginTop: 2 }}>PR e1RM: {lastWeightsLoading && !liveMetricAvailable ? '…' : history.prWeight > 0 ? `${formatWeightKg(history.estimatedOneRepMax)} kg · ${formatWeightKg(history.prWeight)} kg × ${history.prReps}` : '0 kg'}</small>
                  {!loadPrDuplicatesE1rm && <small style={{ display: 'block', marginTop: 2 }}>PR de carga: {lastWeightsLoading && !liveMetricAvailable ? '…' : history.loadPrWeight > 0 ? `${formatWeightKg(history.loadPrWeight)} kg × ${history.loadPrReps}` : '0 kg'}</small>}`,
`                  <small>Objetivo: {targetSets} × {repMin}–{repMax} · RIR {exercise.planned?.rir_target ?? 2}</small>
                  <div className={`progression-cue ${progression.action}`}>
                    <span>PRÓXIMA SESIÓN</span>
                    <strong>{progression.label}</strong>
                    <small>{lastWeightsLoading ? 'Revisando tu sesión anterior…' : progression.reason}</small>
                  </div>
                  <small className="last-session-summary">Última sesión: {lastWeightsLoading ? '…' : previousSession}</small>
                  <small style={{ display: 'block', marginTop: 3 }}>Mejor serie histórica (e1RM): {lastWeightsLoading && !liveMetricAvailable ? '…' : history.prWeight > 0 ? `${formatWeightKg(history.estimatedOneRepMax)} kg · ${formatWeightKg(history.prWeight)} kg × ${history.prReps}` : 'Sin datos'}</small>
                  {!loadPrDuplicatesE1rm && <small style={{ display: 'block', marginTop: 2 }}>Mayor carga histórica: {lastWeightsLoading && !liveMetricAvailable ? '…' : history.loadPrWeight > 0 ? `${formatWeightKg(history.loadPrWeight)} kg × ${history.loadPrReps}` : 'Sin datos'}</small>}`,
    'exercise history display'
  );
}

if (!css.includes('.progression-cue {')) {
  css = replaceRequired(
    css,
`.exercise-detail-media { width: min(100%, 430px); margin: 0 auto; border-radius: 20px; overflow: hidden; background: #f2f3ef; border: 1px solid #34443a; min-height: 220px; display: grid; place-items: center; }
.exercise-detail-media img { width: 100%; max-height: 430px; object-fit: contain; display: block; }`,
`.exercise-detail-media { width: min(180px, 52vw); margin: 2px auto; border-radius: 18px; overflow: hidden; background: #f2f3ef; border: 1px solid #34443a; display: grid; place-items: center; }
.exercise-detail-media img { width: 100%; max-height: 180px; object-fit: contain; display: block; image-rendering: auto; }`,
    'compact exercise media'
  );

  css += `

.progression-cue { margin-top: 10px; width: min(100%, 390px); border: 1px solid #34443a; border-radius: 13px; padding: 9px 11px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 2px 9px; background: #0d1410; }
.progression-cue > span { grid-row: span 2; font-size: 8px; line-height: 1.15; letter-spacing: .1em; font-weight: 900; color: #7f8d84; writing-mode: vertical-rl; transform: rotate(180deg); }
.progression-cue strong { font-size: 13px; letter-spacing: .035em; }
.progression-cue small { color: #98a69d; font-size: 10px; line-height: 1.35; }
.progression-cue.up { border-color: rgba(112,228,72,.42); background: rgba(112,228,72,.075); }
.progression-cue.up strong { color: var(--green); }
.progression-cue.hold { border-color: rgba(255,173,66,.34); background: rgba(255,173,66,.055); }
.progression-cue.hold strong { color: #ffc36d; }
.progression-cue.down { border-color: rgba(255,102,102,.36); background: rgba(255,102,102,.055); }
.progression-cue.down strong { color: #ff9a9a; }
.progression-cue.none strong { color: #aab6ae; }
.last-session-summary { display: block; margin-top: 8px; color: #cfd8d2; font-weight: 700; }
`;
}

await Promise.all([
  writeFile(workoutFile, workout, 'utf8'),
  writeFile(cssFile, css, 'utf8')
]);
console.log('Progression cues and compact exercise media applied.');
