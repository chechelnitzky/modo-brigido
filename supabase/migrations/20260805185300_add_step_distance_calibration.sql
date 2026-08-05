alter table public.profiles
  add column if not exists steps_per_km numeric(8,2)
  check (steps_per_km is null or steps_per_km between 500 and 3000);

comment on column public.profiles.steps_per_km is
  'Calibración opcional de pasos reales por kilómetro. Si es null, la app estima la longitud del paso con height_cm * 0.415.';
