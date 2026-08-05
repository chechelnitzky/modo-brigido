export type Sex = 'male' | 'female';

export type Profile = {
  id: string;
  display_name: string | null;
  timezone: string;
  calories_target: number;
  protein_target: number;
  steps_target: number;
  weight_target: number | null;
  waist_target: number | null;
  sex: Sex | null;
  birth_date: string | null;
  height_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  steps_per_km: number | null;
};

export type DailyLog = {
  id?: string;
  user_id: string;
  log_date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  sleep_score: number | null;
  energy_score: number | null;
  hunger_score: number | null;
  cannabis: boolean | null;
  calories: number | null;
  protein_g: number | null;
  steps: number | null;
  notes: string | null;
};

export type Exercise = {
  id: number;
  slug: string;
  name: string;
  category: string;
  primary_muscle: string;
  pattern: string;
  equipment: string;
  user_id?: string | null;
};
