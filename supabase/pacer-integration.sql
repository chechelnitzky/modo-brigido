-- Pacer step sync for Modo Brigido
-- Applied to production on 2026-08-09. Keep this file as the reproducible setup.

create table if not exists public.pacer_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pacer_user_id text not null,
  display_name text,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  updated_at timestamptz not null default now()
);

create unique index if not exists pacer_connections_pacer_user_idx
  on public.pacer_connections(pacer_user_id);

create table if not exists public.pacer_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists pacer_oauth_states_user_idx
  on public.pacer_oauth_states(user_id, created_at desc);

create table if not exists public.pacer_daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  steps integer not null check (steps >= 0),
  walking_running_distance_m integer,
  calories integer,
  active_time_seconds integer,
  source text,
  synced_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

alter table public.pacer_connections enable row level security;
alter table public.pacer_oauth_states enable row level security;
alter table public.pacer_daily_activity enable row level security;

-- OAuth tokens must never be readable from the browser. Edge Functions use service_role.
revoke all on public.pacer_connections from anon, authenticated;
revoke all on public.pacer_oauth_states from anon, authenticated;
revoke all on public.pacer_daily_activity from anon, authenticated;

drop trigger if exists pacer_connections_updated_at on public.pacer_connections;
create trigger pacer_connections_updated_at
before update on public.pacer_connections
for each row execute function public.set_updated_at();

-- Cron secret is generated inside Postgres and never exposed to the frontend.
insert into public.app_secrets(secret_name, secret_value, updated_at)
values ('pacer_cron_secret', encode(gen_random_bytes(48), 'hex'), now())
on conflict (secret_name) do nothing;

-- Pacer credentials are intentionally NOT committed. Once Pacer issues the developer client,
-- store pacer_client_id and pacer_client_secret in public.app_secrets using the SQL editor/MCP.

-- Requires pg_cron + pg_net (already enabled by Modo Brigido timer notifications).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pacer-hourly-sync') then
    perform cron.unschedule('pacer-hourly-sync');
  end if;
end $$;

select cron.schedule(
  'pacer-hourly-sync',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://ktyivafkrniwtgcgdksh.supabase.co/functions/v1/pacer-integration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select secret_value from public.app_secrets where secret_name = 'pacer_cron_secret')
    ),
    body := '{"action":"sync-all"}'::jsonb
  );
  $$
);
