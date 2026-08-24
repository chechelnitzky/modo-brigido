create table if not exists public.fatsecret_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  oauth_token text not null,
  oauth_secret text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fatsecret_oauth_requests (
  oauth_token text primary key,
  oauth_token_secret text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists fatsecret_oauth_requests_user_id_idx on public.fatsecret_oauth_requests(user_id);
create index if not exists fatsecret_oauth_requests_created_at_idx on public.fatsecret_oauth_requests(created_at);

alter table public.fatsecret_connections enable row level security;
alter table public.fatsecret_oauth_requests enable row level security;

-- No client RLS policies are intentionally created: OAuth secrets are only accessible
-- to the service-role Edge Function, which bypasses RLS.
