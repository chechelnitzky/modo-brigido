alter table public.daily_logs add column if not exists nutrition_source text;
alter table public.daily_logs add column if not exists nutrition_synced_at timestamptz;

create index if not exists daily_logs_nutrition_synced_at_idx
  on public.daily_logs(nutrition_synced_at)
  where nutrition_source = 'fatsecret';

-- FatSecret permits user data caching for less than 24 hours. Clear cached totals
-- every 15 minutes once they reach 23h45m; viewing the date again refetches them.
do $do$
begin
  if not exists (select 1 from cron.job where jobname = 'cleanup-fatsecret-nutrition-cache') then
    perform cron.schedule(
      'cleanup-fatsecret-nutrition-cache',
      '*/15 * * * *',
      $job$
        update public.daily_logs
        set calories = null,
            protein_g = null,
            nutrition_source = null,
            nutrition_synced_at = null
        where nutrition_source = 'fatsecret'
          and nutrition_synced_at < now() - interval '23 hours 45 minutes';
      $job$
    );
  end if;
end
$do$;
