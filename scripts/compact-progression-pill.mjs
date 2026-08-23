import { readFile, writeFile } from 'node:fs/promises';

const workoutFile = new URL('../src/pages/WorkoutSessionPageV2.tsx', import.meta.url);
const cssFile = new URL('../src/exercise-library.css', import.meta.url);
let workout = await readFile(workoutFile, 'utf8');
let css = await readFile(cssFile, 'utf8');

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error('Compact progression upgrade failed: ' + label);
  return source.replace(from, to);
}

if (!workout.includes('progression-pill-arrow')) {
  workout = replaceRequired(
    workout,
`          const historicalHistory = normalizeHistoryMetric(
            exerciseHistoryMetrics[String(exercise.exercise_id)],
            lastExerciseWeights[String(exercise.exercise_id)] ?? 0
          );
          const liveBest = bestSetMetric(exercise.workout_sets ?? [], false);
          const history = mergeBestMetrics(historicalHistory, liveBest);
          const liveMetricAvailable = liveBest.estimatedOneRepMax > 0 || liveBest.loadPrWeight > 0;
          const loadPrDuplicatesE1rm = history.loadPrWeight === history.prWeight && history.loadPrReps === history.prReps;
          const targetSets = Number(exercise.planned?.target_sets ?? exercise.workout_sets.length ?? 2);`,
`          const historicalHistory = normalizeHistoryMetric(
            exerciseHistoryMetrics[String(exercise.exercise_id)],
            lastExerciseWeights[String(exercise.exercise_id)] ?? 0
          );
          const targetSets = Number(exercise.planned?.target_sets ?? exercise.workout_sets.length ?? 2);`,
    'remove PR-only live calculations from card'
  );

  workout = replaceRequired(
    workout,
`                  <span>{exercise.exercise?.primary_muscle} · {exercise.exercise?.equipment}</span>
                  <h2>{exercise.exercise?.name || 'Ejercicio'}</h2>
                  <small>Objetivo: {targetSets} × {repMin}–{repMax} · RIR {exercise.planned?.rir_target ?? 2}</small>
                  <div className={'progression-cue ' + progression.action}>
                    <span>PRÓXIMA SESIÓN</span>
                    <strong>{progression.label}</strong>
                    <small>{lastWeightsLoading ? 'Revisando tu sesión anterior…' : progression.reason}</small>
                  </div>
                  <small className="last-session-summary">Última sesión: {lastWeightsLoading ? '…' : previousSession}</small>
                  <small style={{ display: 'block', marginTop: 3 }}>Mejor serie histórica (e1RM): {lastWeightsLoading && !liveMetricAvailable ? '…' : history.prWeight > 0 ? formatWeightKg(history.estimatedOneRepMax) + ' kg · ' + formatWeightKg(history.prWeight) + ' kg × ' + history.prReps : 'Sin datos'}</small>
                  {!loadPrDuplicatesE1rm && <small style={{ display: 'block', marginTop: 2 }}>Mayor carga histórica: {lastWeightsLoading && !liveMetricAvailable ? '…' : history.loadPrWeight > 0 ? formatWeightKg(history.loadPrWeight) + ' kg × ' + history.loadPrReps : 'Sin datos'}</small>}`,
`                  <span>{exercise.exercise?.primary_muscle} · {exercise.exercise?.equipment}</span>
                  <div className="exercise-name-row">
                    <h2>{exercise.exercise?.name || 'Ejercicio'}</h2>
                    <span className={'progression-pill ' + progression.action} title={progression.reason}>
                      <span className="progression-pill-arrow" aria-hidden="true">{progression.action === 'up' ? '↑' : progression.action === 'down' ? '↓' : progression.action === 'hold' ? '→' : '•'}</span>
                      {progression.action === 'up' ? 'Subir' : progression.action === 'down' ? 'Bajar' : progression.action === 'hold' ? 'Mantener' : 'Sin datos'}
                    </span>
                  </div>
                  <small>Objetivo: {targetSets} × {repMin}–{repMax} · RIR {exercise.planned?.rir_target ?? 2}</small>
                  <small className="last-session-summary">Última sesión: {lastWeightsLoading ? '…' : previousSession}</small>`,
    'compact pill and last-session-only display'
  );
}

const oldCss = `.progression-cue { margin-top: 10px; width: min(100%, 390px); border: 1px solid #34443a; border-radius: 13px; padding: 9px 11px; display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 2px 9px; background: #0d1410; }
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
.last-session-summary { display: block; margin-top: 8px; color: #cfd8d2; font-weight: 700; }`;

const newCss = `.exercise-name-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; min-width: 0; }
.exercise-name-row h2 { min-width: 0; margin: 2px 0 3px; }
.progression-pill { flex: 0 0 auto; display: inline-flex !important; align-items: center; gap: 4px; margin-top: 2px; padding: 5px 8px; border-radius: 999px; border: 1px solid #34443a; background: #101713; color: #aab6ae !important; font-size: 9px !important; font-weight: 850; line-height: 1; white-space: nowrap; text-transform: uppercase; letter-spacing: .025em; }
.progression-pill-arrow { display: inline !important; margin: 0 !important; color: inherit !important; font-size: 12px !important; font-weight: 950; line-height: .8; }
.progression-pill.up { color: var(--green) !important; border-color: rgba(112,228,72,.38); background: rgba(112,228,72,.075); }
.progression-pill.hold { color: #ffc36d !important; border-color: rgba(255,173,66,.34); background: rgba(255,173,66,.06); }
.progression-pill.down { color: #ff9a9a !important; border-color: rgba(255,102,102,.36); background: rgba(255,102,102,.06); }
.progression-pill.none { color: #96a29a !important; }
.last-session-summary { display: block; margin-top: 5px; color: #cfd8d2 !important; font-weight: 700; }
@media (max-width: 430px) {
  .progression-pill { padding: 4px 7px; font-size: 8px !important; }
  .progression-pill-arrow { font-size: 11px !important; }
}`;

if (!css.includes('.progression-pill {')) {
  css = replaceRequired(css, oldCss, newCss, 'replace giant progression card styles');
}

await Promise.all([
  writeFile(workoutFile, workout, 'utf8'),
  writeFile(cssFile, css, 'utf8')
]);

console.log('Compact progression pill applied.');
