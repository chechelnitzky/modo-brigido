import type { Exercise } from '../types';

export const EXERCISE_BASIC_SELECT = 'id,slug,name,category,primary_muscle,pattern,equipment,user_id,source,source_exercise_id,body_part,target_muscle,muscle_group,secondary_muscles,thumbnail_url,gif_url,recommendation_rank,is_recommended,is_verified,quality_status';
export const EXERCISE_DETAIL_SELECT = `${EXERCISE_BASIC_SELECT},source_media_id,instructions_es,instruction_steps_es,media_attribution,media_license_status`;

const MUSCLE_LABELS: Record<string, string> = {
  abs: 'Abdominales',
  abductors: 'Abductores',
  adductors: 'Aductores',
  biceps: 'Bíceps',
  calves: 'Pantorrillas',
  'cardiovascular system': 'Cardiovascular',
  delts: 'Hombros',
  forearms: 'Antebrazos',
  glutes: 'Glúteos',
  hamstrings: 'Isquiotibiales',
  lats: 'Dorsales',
  'levator scapulae': 'Elevador de la escápula',
  pectorals: 'Pecho',
  quads: 'Cuádriceps',
  'serratus anterior': 'Serrato anterior',
  spine: 'Espalda / columna',
  traps: 'Trapecios',
  triceps: 'Tríceps',
  'upper back': 'Espalda alta'
};

const BODY_PART_LABELS: Record<string, string> = {
  back: 'Espalda',
  cardio: 'Cardio',
  chest: 'Pecho',
  'lower arms': 'Antebrazos',
  'lower legs': 'Pantorrillas',
  neck: 'Cuello',
  shoulders: 'Hombros',
  'upper arms': 'Brazos',
  'upper legs': 'Piernas',
  waist: 'Core'
};

export function muscleLabel(value?: string | null): string {
  if (!value) return 'General';
  return MUSCLE_LABELS[value.toLowerCase()] ?? value;
}

export function bodyPartLabel(value?: string | null): string {
  if (!value) return 'General';
  return BODY_PART_LABELS[value.toLowerCase()] ?? value;
}

export function exerciseSearchText(exercise: Exercise): string {
  return [
    exercise.name,
    exercise.primary_muscle,
    exercise.target_muscle,
    exercise.muscle_group,
    ...(exercise.secondary_muscles ?? []),
    exercise.body_part,
    exercise.equipment,
    exercise.pattern,
    exercise.category
  ].filter(Boolean).join(' ').toLowerCase();
}

export function matchesExerciseSearch(exercise: Exercise, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return !normalized || exerciseSearchText(exercise).includes(normalized);
}

export type RankedAlternative = {
  exercise: Exercise;
  score: number;
  reason: string;
};

export function rankExerciseAlternatives(current: Exercise | null | undefined, candidates: Exercise[]): RankedAlternative[] {
  if (!current) {
    return candidates
      .map((exercise) => ({
        exercise,
        score: (exercise.is_verified ? 35 : 0) + (exercise.is_recommended ? 20 : 0) + Number(exercise.recommendation_rank ?? 0),
        reason: exercise.is_verified ? 'Selección verificada de Modo Brígido' : exercise.is_recommended ? 'Alternativa recomendada' : 'Alternativa disponible'
      }))
      .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'es'));
  }

  return candidates
    .filter((exercise) => exercise.id !== current.id)
    .map((exercise) => {
      let score = Number(exercise.recommendation_rank ?? 0) * 0.35;
      const reasons: string[] = [];

      if (exercise.target_muscle && current.target_muscle && exercise.target_muscle === current.target_muscle) {
        score += 70;
        reasons.push('mismo músculo objetivo');
      } else if (exercise.primary_muscle.toLowerCase() === current.primary_muscle.toLowerCase()) {
        score += 55;
        reasons.push('mismo músculo principal');
      }

      if (exercise.pattern && current.pattern && exercise.pattern === current.pattern) {
        score += 55;
        reasons.push('mismo patrón');
      }
      if (exercise.body_part && current.body_part && exercise.body_part === current.body_part) score += 22;
      if (exercise.category === current.category) score += 18;
      if (exercise.equipment.toLowerCase() === current.equipment.toLowerCase()) {
        score += 18;
        reasons.push('mismo equipo');
      }
      if (exercise.is_verified) score += 28;
      if (exercise.is_recommended) score += 18;
      if (exercise.gif_url) score += 3;

      const reason = reasons.length >= 2
        ? `Muy compatible: ${reasons.slice(0, 3).join(' · ')}`
        : reasons.length === 1
          ? `Compatible: ${reasons[0]}`
          : exercise.is_recommended
            ? 'Alternativa recomendada por la biblioteca Bestia'
            : 'Alternativa relacionada';

      return { exercise, score, reason };
    })
    .sort((a, b) => b.score - a.score || Number(b.exercise.is_verified) - Number(a.exercise.is_verified) || a.exercise.name.localeCompare(b.exercise.name, 'es'));
}

export function bodyGroupMatches(exercise: Exercise, group: string): boolean {
  if (!group || group === 'all') return true;
  if (group === 'arms') return exercise.body_part === 'upper arms' || exercise.body_part === 'lower arms';
  if (group === 'legs') return exercise.body_part === 'upper legs' || exercise.body_part === 'lower legs';
  return exercise.body_part === group;
}
