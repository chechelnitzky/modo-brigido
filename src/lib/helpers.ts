import type { DailyLog, Profile } from '../types';

export function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function dailyScore(log: DailyLog | null, profile: Profile | null): number {
  if (!log || !profile) return 0;
  let score = 0;
  if (log.weight_kg !== null) score += 10;
  if (log.waist_cm !== null) score += 10;
  if (
    log.calories !== null &&
    log.calories >= profile.calories_target - 100 &&
    log.calories <= profile.calories_target + 100
  ) score += 20;
  if ((log.protein_g ?? 0) >= profile.protein_target) score += 20;
  if ((log.steps ?? 0) >= profile.steps_target) score += 20;
  if (log.sleep_score !== null && log.energy_score !== null) score += 10;
  if (log.notes !== null || log.cannabis !== null || log.hunger_score !== null) score += 10;
  return Math.min(score, 100);
}

export function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
