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
  steps_per_km?: number | null;
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
  manual_steps: number | null;
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
  source?: string | null;
  source_exercise_id?: string | null;
  source_media_id?: string | null;
  body_part?: string | null;
  target_muscle?: string | null;
  muscle_group?: string | null;
  secondary_muscles?: string[] | null;
  instructions_es?: string | null;
  instruction_steps_es?: string[] | null;
  thumbnail_url?: string | null;
  gif_url?: string | null;
  media_attribution?: string | null;
  media_license_status?: string | null;
  recommendation_rank?: number | null;
  is_recommended?: boolean | null;
  is_verified?: boolean | null;
  quality_status?: string | null;
};
