-- Modo Brígido — ejercicios personalizados por usuario
-- Ejecutar una vez en Supabase > SQL Editor > New query > Run.

alter table public.exercise_library
  add column if not exists user_id uuid references public.profiles(id) on delete cascade;

alter table public.exercise_library
  drop constraint if exists exercise_library_category_check;

alter table public.exercise_library
  add constraint exercise_library_category_check
  check (category in ('push','pull','legs','core','full_body','cardio','mobility','other'));

create index if not exists exercise_library_user_idx
  on public.exercise_library(user_id);

alter table public.exercise_library enable row level security;

drop policy if exists "exercise library read" on public.exercise_library;
drop policy if exists "exercise library own insert" on public.exercise_library;
drop policy if exists "exercise library own update" on public.exercise_library;
drop policy if exists "exercise library own delete" on public.exercise_library;

create policy "exercise library read"
on public.exercise_library
for select
to authenticated
using (user_id is null or user_id = auth.uid());

create policy "exercise library own insert"
on public.exercise_library
for insert
to authenticated
with check (user_id = auth.uid());

create policy "exercise library own update"
on public.exercise_library
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "exercise library own delete"
on public.exercise_library
for delete
to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on public.exercise_library to authenticated;
grant usage, select on sequence public.exercise_library_id_seq to authenticated;
