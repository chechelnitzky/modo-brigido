import type { Sex } from '../types';

export type BodyFatScaleRange = {
  min: number;
  max: number;
  label: string;
  description: string;
  tone: 'critical' | 'essential' | 'athlete' | 'fitness' | 'average' | 'obesity';
};

export type BodyFatScale = {
  max: number;
  ranges: BodyFatScaleRange[];
};

const BODY_FAT_SCALES: Record<Sex, BodyFatScale> = {
  male: {
    max: 40,
    ranges: [
      { min: 0, max: 2, label: 'Muy bajo', description: 'Por debajo de la grasa esencial', tone: 'critical' },
      { min: 2, max: 6, label: 'Esencial', description: 'Grasa necesaria para funciones vitales', tone: 'essential' },
      { min: 6, max: 14, label: 'Atleta', description: 'Rango atlético y de alta definición', tone: 'athlete' },
      { min: 14, max: 18, label: 'Fitness', description: 'Rango físico saludable y definido', tone: 'fitness' },
      { min: 18, max: 25, label: 'Promedio', description: 'Rango habitual de la población', tone: 'average' },
      { min: 25, max: 40, label: 'Obesidad', description: 'Rango elevado de grasa corporal', tone: 'obesity' }
    ]
  },
  female: {
    max: 45,
    ranges: [
      { min: 0, max: 10, label: 'Muy bajo', description: 'Por debajo de la grasa esencial', tone: 'critical' },
      { min: 10, max: 14, label: 'Esencial', description: 'Grasa necesaria para funciones vitales', tone: 'essential' },
      { min: 14, max: 21, label: 'Atleta', description: 'Rango atlético y de alta definición', tone: 'athlete' },
      { min: 21, max: 25, label: 'Fitness', description: 'Rango físico saludable y definido', tone: 'fitness' },
      { min: 25, max: 32, label: 'Promedio', description: 'Rango habitual de la población', tone: 'average' },
      { min: 32, max: 45, label: 'Obesidad', description: 'Rango elevado de grasa corporal', tone: 'obesity' }
    ]
  }
};

export function getBodyFatScale(sex: Sex): BodyFatScale {
  return BODY_FAT_SCALES[sex];
}

export function getBodyFatScaleRange(sex: Sex, percentage: number): BodyFatScaleRange {
  const scale = getBodyFatScale(sex);
  return scale.ranges.find((range, index) => (
    percentage >= range.min && (percentage < range.max || index === scale.ranges.length - 1)
  )) ?? scale.ranges.at(-1)!;
}

export function formatBodyFatRange(range: BodyFatScaleRange, isLast: boolean): string {
  if (range.min === 0) return `< ${range.max}%`;
  if (isLast) return `≥ ${range.min}%`;
  return `${range.min}–${range.max}%`;
}
