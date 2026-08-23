import { readFile, writeFile } from 'node:fs/promises';

const workoutFile = new URL('../src/pages/WorkoutSessionPageV2.tsx', import.meta.url);
const cssFile = new URL('../src/exercise-library.css', import.meta.url);
let workout = await readFile(workoutFile, 'utf8');
let css = await readFile(cssFile, 'utf8');

const oldLine = `                  <small className="last-session-summary">Última sesión: {lastWeightsLoading ? '…' : previousSession}</small>`;
const newLines = `${oldLine}\n                  <small className="history-pr-line">PR: {lastWeightsLoading ? '…' : historicalHistory.prWeight > 0 ? formatWeightKg(historicalHistory.prWeight) + ' kg × ' + historicalHistory.prReps + ' · e1RM ' + formatWeightKg(historicalHistory.estimatedOneRepMax) + ' kg' : 'Sin datos'}</small>`;

if (!workout.includes('className="history-pr-line"')) {
  if (!workout.includes(oldLine)) throw new Error('Could not find last session summary line');
  workout = workout.replace(oldLine, newLines);
}

if (!css.includes('.history-pr-line {')) {
  css += `\n.history-pr-line { display: block; margin-top: 2px; color: #819087 !important; font-size: 10px !important; font-weight: 600; }\n`;
}

await Promise.all([
  writeFile(workoutFile, workout, 'utf8'),
  writeFile(cssFile, css, 'utf8')
]);
console.log('Restored compact PR and e1RM line.');
