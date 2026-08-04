-- Modo Brígido v2 — composición corporal y medidas antropométricas
-- Ejecutar una vez en Supabase > SQL Editor > New query > Run.

alter table public.profiles
  add column if not exists sex text,
  add column if not exists birth_date date,
  add column if not exists height_cm numeric(6,2),
  add column if not exists neck_cm numeric(6,2),
  add column if not exists hip_cm numeric(6,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_sex_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_sex_check check (sex is null or sex in ('male', 'female'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_height_cm_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_height_cm_check check (height_cm is null or height_cm between 100 and 250);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_neck_cm_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_neck_cm_check check (neck_cm is null or neck_cm between 15 and 90);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_hip_cm_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_hip_cm_check check (hip_cm is null or hip_cm between 40 and 250);
  end if;
end $$;

alter table public.daily_logs add column if not exists neck_cm numeric(6,2), add column if not exists hip_cm numeric(6,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_logs_neck_cm_check' and conrelid = 'public.daily_logs'::regclass) then
    alter table public.daily_logs add constraint daily_logs_neck_cm_check check (neck_cm is null or neck_cm between 15 and 90);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'daily_logs_hip_cm_check' and conrelid = 'public.daily_logs'::regclass) then
    alter table public.daily_logs add constraint daily_logs_hip_cm_check check (hip_cm is null or hip_cm between 40 and 250);
  end if;
end $$;

comment on column public.profiles.sex is 'Sexo usado por la fórmula antropométrica U.S. Navy: male o female.';
comment on column public.profiles.birth_date is 'Fecha de nacimiento para referencia etaria Jackson & Pollock.';
comment on column public.profiles.height_cm is 'Altura en centímetros.';
comment on column public.profiles.neck_cm is 'Circunferencia base de cuello en centímetros.';
comment on column public.profiles.hip_cm is 'Circunferencia base de cadera en centímetros; requerida para fórmula femenina.';
comment on column public.daily_logs.neck_cm is 'Medida diaria opcional de cuello; si es null la app usa profiles.neck_cm.';
comment on column public.daily_logs.hip_cm is 'Medida diaria opcional de cadera; si es null la app usa profiles.hip_cm.';
