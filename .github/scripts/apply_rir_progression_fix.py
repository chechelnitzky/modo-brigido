from pathlib import Path

path = Path('src/pages/WorkoutSessionPageV2.tsx')
text = path.read_text(encoding='utf-8')

replacements = [
    (
        "type LastSetPerformance = { setNumber: number; weight: number; reps: number };",
        "type LastSetPerformance = { setNumber: number; weight: number; reps: number; rir: number | null };",
    ),
    (
        "? value.lastSets.map((set: any) => ({ setNumber: Number(set.setNumber) || 0, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0 })).filter((set: LastSetPerformance) => set.setNumber > 0 && set.reps > 0)",
        "? value.lastSets.map((set: any) => ({ setNumber: Number(set.setNumber) || 0, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0, rir: numberOrNull(set.rir) })).filter((set: LastSetPerformance) => set.setNumber > 0 && set.reps > 0)",
    ),
    (
        ".map((set: any) => ({ setNumber: Number(set.set_number), weight: Number(set.weight_kg), reps: Number(set.reps) }))",
        ".map((set: any) => ({ setNumber: Number(set.set_number), weight: Number(set.weight_kg), reps: Number(set.reps), rir: numberOrNull(set.rir) }))",
    ),
    (
        "function progressionCue(history: ExerciseHistoryMetric, targetSets: number, repMin: number, repMax: number): ProgressionCue {\n  const requiredSets = Math.max(1, targetSets);\n  const sets = history.lastSets.slice(0, requiredSets);\n  if (!sets.length) return { action: 'none', label: 'SIN DATOS', reason: 'Completa una sesión para recibir una recomendación de carga.' };\n\n  if (sets.some((set) => set.reps < repMin)) {\n    return { action: 'down', label: 'BAJAR PESO', reason: 'Al menos una serie quedó bajo el mínimo de ' + repMin + ' reps.' };\n  }\n\n  if (sets.length < requiredSets) {\n    return { action: 'hold', label: 'MANTENER', reason: 'Faltan series completas: ' + sets.length + '/' + requiredSets + '. Repite la carga antes de cambiarla.' };\n  }\n\n  const firstWeight = sets[0].weight;\n  const sameWeight = sets.every((set) => Math.abs(set.weight - firstWeight) < 0.001);\n  const allAtTop = sets.every((set) => set.reps >= repMax);\n\n  if (allAtTop && sameWeight) {\n    return { action: 'up', label: 'SUBIR PESO', reason: 'Completaste las ' + requiredSets + ' series en ' + repMax + ' reps o más con la misma carga.' };\n  }\n\n  if (allAtTop && !sameWeight) {\n    return { action: 'hold', label: 'MANTENER', reason: 'Llegaste al tope de reps, pero cambiaste la carga entre series. Repítela estable antes de subir.' };\n  }\n\n  return { action: 'hold', label: 'MANTENER', reason: 'Mantén la carga hasta llevar todas las series a ' + repMax + ' reps.' };\n}",
        "function progressionCue(history: ExerciseHistoryMetric, targetSets: number, repMin: number, repMax: number, targetRir: number): ProgressionCue {\n  const requiredSets = Math.max(1, targetSets);\n  const sets = history.lastSets.slice(0, requiredSets);\n  if (!sets.length) return { action: 'none', label: 'SIN DATOS', reason: 'Completa una sesión para recibir una recomendación de carga.' };\n\n  if (sets.some((set) => set.reps < repMin)) {\n    return { action: 'down', label: 'BAJAR PESO', reason: 'Al menos una serie quedó bajo el mínimo de ' + repMin + ' reps.' };\n  }\n\n  if (sets.length < requiredSets) {\n    return { action: 'hold', label: 'MANTENER', reason: 'Faltan series completas: ' + sets.length + '/' + requiredSets + '. Repite la carga antes de cambiarla.' };\n  }\n\n  const firstWeight = sets[0].weight;\n  const sameWeight = sets.every((set) => Math.abs(set.weight - firstWeight) < 0.001);\n  const allAtTop = sets.every((set) => set.reps >= repMax);\n  const rirValues = sets.map((set) => set.rir).filter((rir): rir is number => rir !== null && Number.isFinite(rir));\n  const hasCompleteRir = rirValues.length === requiredSets;\n  const averageRir = hasCompleteRir ? rirValues.reduce((sum, rir) => sum + rir, 0) / rirValues.length : null;\n\n  if (allAtTop && sameWeight && !hasCompleteRir) {\n    return { action: 'hold', label: 'MANTENER', reason: 'Llegaste al tope de reps, pero falta registrar el RIR de todas las series. Mantén la carga antes de subir.' };\n  }\n\n  if (allAtTop && sameWeight && averageRir !== null && averageRir >= targetRir) {\n    return { action: 'up', label: 'SUBIR PESO', reason: 'Completaste las ' + requiredSets + ' series en ' + repMax + ' reps o más con RIR promedio ' + formatRir(averageRir) + ' (objetivo ' + formatRir(targetRir) + ').' };\n  }\n\n  if (allAtTop && sameWeight && averageRir !== null) {\n    return { action: 'hold', label: 'MANTENER', reason: 'Llegaste al tope de reps, pero el RIR promedio fue ' + formatRir(averageRir) + ' y el objetivo es ' + formatRir(targetRir) + '. Mantén la carga hasta hacer las reps con ese margen.' };\n  }\n\n  if (allAtTop && !sameWeight) {\n    return { action: 'hold', label: 'MANTENER', reason: 'Llegaste al tope de reps, pero cambiaste la carga entre series. Repítela estable antes de subir.' };\n  }\n\n  return { action: 'hold', label: 'MANTENER', reason: 'Mantén la carga hasta llevar todas las series a ' + repMax + ' reps.' };\n}",
    ),
    (
        "function lastSessionSummary(history: ExerciseHistoryMetric, targetSets: number): string {\n  const sets = history.lastSets.slice(0, Math.max(1, targetSets));\n  if (!sets.length) return 'Sin sesión anterior';\n  const sameWeight = sets.every((set) => Math.abs(set.weight - sets[0].weight) < 0.001);\n  if (sameWeight) return formatWeightKg(sets[0].weight) + ' kg × ' + sets.map((set) => set.reps).join(' / ');\n  return sets.map((set) => formatWeightKg(set.weight) + ' kg × ' + set.reps).join(' · ');\n}",
        "function lastSessionSummary(history: ExerciseHistoryMetric, targetSets: number): string {\n  const sets = history.lastSets.slice(0, Math.max(1, targetSets));\n  if (!sets.length) return 'Sin sesión anterior';\n  const sameWeight = sets.every((set) => Math.abs(set.weight - sets[0].weight) < 0.001);\n  const rirValues = sets.map((set) => set.rir).filter((rir): rir is number => rir !== null && Number.isFinite(rir));\n  const rirSummary = rirValues.length === sets.length\n    ? ' · RIR prom. ' + formatRir(rirValues.reduce((sum, rir) => sum + rir, 0) / rirValues.length)\n    : ' · RIR prom. —';\n  if (sameWeight) return formatWeightKg(sets[0].weight) + ' kg × ' + sets.map((set) => set.reps).join(' / ') + rirSummary;\n  return sets.map((set) => formatWeightKg(set.weight) + ' kg × ' + set.reps).join(' · ') + rirSummary;\n}",
    ),
    (
        "function formatWeightKg(weight: number): string {\n  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number.isFinite(weight) ? weight : 0);\n}\n\nfunction numberOrNull",
        "function formatWeightKg(weight: number): string {\n  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number.isFinite(weight) ? weight : 0);\n}\n\nfunction formatRir(rir: number): string {\n  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number.isFinite(rir) ? rir : 0);\n}\n\nfunction numberOrNull",
    ),
    (
        ".select(`id,finished_at,workout_exercises(exercise_id,workout_sets(set_number,weight_kg,reps,completed))`)",
        ".select(`id,finished_at,workout_exercises(exercise_id,workout_sets(set_number,weight_kg,reps,rir,completed))`)",
    ),
    (
        "          const repMax = Number(exercise.planned?.rep_max ?? 12);\n          const progression = progressionCue(historicalHistory, targetSets, repMin, repMax);",
        "          const repMax = Number(exercise.planned?.rep_max ?? 12);\n          const targetRir = Number(exercise.planned?.rir_target ?? 2);\n          const progression = progressionCue(historicalHistory, targetSets, repMin, repMax, targetRir);",
    ),
    (
        "<small>Objetivo: {targetSets} × {repMin}–{repMax} · RIR {exercise.planned?.rir_target ?? 2}</small>",
        "<small>Objetivo: {targetSets} × {repMin}–{repMax} · RIR {targetRir}</small>",
    ),
]

for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one match, found {count}: {old[:120]!r}')
    text = text.replace(old, new, 1)

path.write_text(text, encoding='utf-8')
print('Applied RIR-aware progression fix successfully.')
