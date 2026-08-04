import type { DailyLog, Profile, Sex } from '../types';

export type BodyCompositionEstimate = {
  method: 'U.S. Navy';
  age: number | null;
  bodyFatPercentage: number;
  category: string;
  fatMassKg: number;
  leanMassKg: number;
  idealBodyFatPercentage: number | null;
  estimatedTargetWeightKg: number | null;
  estimatedWeightToLoseKg: number | null;
};

const JACKSON_POLLOCK_REFERENCE: Record<Sex, Array<[number, number]>> = {
  female: [
    [20, 17.7], [25, 18.4], [30, 19.3], [35, 21.5],
    [40, 22.2], [45, 22.9], [50, 25.2], [55, 26.3]
  ],
  male: [
    [20, 8.5], [25, 10.5], [30, 12.7], [35, 13.7],
    [40, 15.3], [45, 16.4], [50, 18.9], [55, 20.9]
  ]
};

export function ageFromBirthDate(birthDate: string | null | undefined, at = new Date()): number | null {
  if (!birthDate) return null;
  const date = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  let age = at.getFullYear() - date.getFullYear();
  const monthDelta = at.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && at.getDate() < date.getDate())) age--;
  return age >= 10 && age <= 120 ? age : null;
}

export function idealBodyFatForAge(sex: Sex, age: number | null): number | null {
  if (age === null) return null;
  const table = JACKSON_POLLOCK_REFERENCE[sex];
  if (age <= table[0][0]) return table[0][1];
  if (age >= table.at(-1)![0]) return table.at(-1)![1];
  for (let index = 0; index < table.length - 1; index++) {
    const [ageA, valueA] = table[index];
    const [ageB, valueB] = table[index + 1];
    if (age >= ageA && age <= ageB) {
      const ratio = (age - ageA) / (ageB - ageA);
      return valueA + ratio * (valueB - valueA);
    }
  }
  return null;
}

export function bodyFatCategory(sex: Sex, percentage: number): string {
  if (sex === 'male') {
    if (percentage < 6) return 'Grasa esencial';
    if (percentage < 14) return 'Atleta';
    if (percentage < 18) return 'Fitness';
    if (percentage < 25) return 'Promedio';
    return 'Obesidad';
  }
  if (percentage < 14) return 'Grasa esencial';
  if (percentage < 21) return 'Atleta';
  if (percentage < 25) return 'Fitness';
  if (percentage < 32) return 'Promedio';
  return 'Obesidad';
}

export function estimateBodyComposition(input: {
  sex: Sex | null | undefined;
  birthDate?: string | null;
  heightCm: number | null | undefined;
  weightKg: number | null | undefined;
  neckCm: number | null | undefined;
  waistCm: number | null | undefined;
  hipCm?: number | null;
}): BodyCompositionEstimate | null {
  const { sex, heightCm, weightKg, neckCm, waistCm, hipCm } = input;
  if (!sex || !heightCm || !weightKg || !neckCm || !waistCm) return null;
  if (heightCm <= 0 || weightKg <= 0 || neckCm <= 0 || waistCm <= 0) return null;

  let denominator: number;
  if (sex === 'male') {
    const circumferenceDelta = waistCm - neckCm;
    if (circumferenceDelta <= 0) return null;
    denominator = 1.0324 - 0.19077 * Math.log10(circumferenceDelta) + 0.15456 * Math.log10(heightCm);
  } else {
    if (!hipCm || hipCm <= 0) return null;
    const circumferenceDelta = waistCm + hipCm - neckCm;
    if (circumferenceDelta <= 0) return null;
    denominator = 1.29579 - 0.35004 * Math.log10(circumferenceDelta) + 0.221 * Math.log10(heightCm);
  }

  const rawPercentage = 495 / denominator - 450;
  if (!Number.isFinite(rawPercentage) || rawPercentage <= 0 || rawPercentage >= 75) return null;

  const bodyFatPercentage = Math.round(rawPercentage * 10) / 10;
  const fatMassKg = weightKg * bodyFatPercentage / 100;
  const leanMassKg = weightKg - fatMassKg;
  const age = ageFromBirthDate(input.birthDate);
  const idealBodyFatPercentage = idealBodyFatForAge(sex, age);
  const estimatedTargetWeightKg = idealBodyFatPercentage === null
    ? null
    : leanMassKg / (1 - idealBodyFatPercentage / 100);
  const estimatedWeightToLoseKg = estimatedTargetWeightKg === null
    ? null
    : Math.max(0, weightKg - estimatedTargetWeightKg);

  return {
    method: 'U.S. Navy',
    age,
    bodyFatPercentage,
    category: bodyFatCategory(sex, bodyFatPercentage),
    fatMassKg: Math.round(fatMassKg * 10) / 10,
    leanMassKg: Math.round(leanMassKg * 10) / 10,
    idealBodyFatPercentage: idealBodyFatPercentage === null ? null : Math.round(idealBodyFatPercentage * 10) / 10,
    estimatedTargetWeightKg: estimatedTargetWeightKg === null ? null : Math.round(estimatedTargetWeightKg * 10) / 10,
    estimatedWeightToLoseKg: estimatedWeightToLoseKg === null ? null : Math.round(estimatedWeightToLoseKg * 10) / 10
  };
}

export function estimateBodyCompositionForLog(profile: Profile, log: DailyLog): BodyCompositionEstimate | null {
  return estimateBodyComposition({
    sex: profile.sex,
    birthDate: profile.birth_date,
    heightCm: profile.height_cm,
    weightKg: log.weight_kg,
    waistCm: log.waist_cm,
    neckCm: log.neck_cm ?? profile.neck_cm,
    hipCm: log.hip_cm ?? profile.hip_cm
  });
}

export function missingBodyFatFields(profile: Profile, log?: DailyLog | null): string[] {
  const missing: string[] = [];
  if (!profile.sex) missing.push('sexo para la fórmula');
  if (!profile.height_cm) missing.push('altura');
  if (!(log?.weight_kg)) missing.push('peso');
  if (!(log?.waist_cm)) missing.push('cintura');
  if (!(log?.neck_cm ?? profile.neck_cm)) missing.push('cuello');
  if (profile.sex === 'female' && !(log?.hip_cm ?? profile.hip_cm)) missing.push('cadera');
  return missing;
}
