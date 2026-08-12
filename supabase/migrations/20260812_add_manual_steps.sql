alter table public.daily_logs
  add column if not exists manual_steps integer not null default 0;

alter table public.daily_logs
  drop constraint if exists daily_logs_manual_steps_check;

alter table public.daily_logs
  add constraint daily_logs_manual_steps_check check (manual_steps >= 0);
