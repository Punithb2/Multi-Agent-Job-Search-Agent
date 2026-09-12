-- ===========================================================================
-- CareerAtlas · Supabase schema (free tier)
-- ---------------------------------------------------------------------------
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> Run.
-- The script is idempotent, so it is safe to re-run after edits.
--
-- Privacy note: CareerAtlas never stores resume PDFs or raw extracted resume
-- text. Only search inputs, ranked job snapshots, and saved job snapshots are
-- persisted, and every row is owned by exactly one authenticated user.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. profiles — one row per auth user, created automatically on sign up
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. search_history — one row per completed search, with its result snapshot
-- ---------------------------------------------------------------------------
create table if not exists public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_role text not null,
  country text not null,
  location text,
  filters jsonb not null default '{}'::jsonb,
  results_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists search_history_user_created_idx
  on public.search_history (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. saved_jobs — bookmarked listings, stored as the job JSON snapshot
-- ---------------------------------------------------------------------------
create table if not exists public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id text,
  job_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_jobs_user_created_idx
  on public.saved_jobs (user_id, created_at desc);

-- Blocks duplicate saves of the same listing for the same user.
create unique index if not exists saved_jobs_user_job_unique_idx
  on public.saved_jobs (user_id, job_id)
  where job_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security — every table is locked down, owner-only access
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.search_history enable row level security;
alter table public.saved_jobs     enable row level security;

-- profiles: read, create, and update only your own profile.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- search_history: read, create, and delete only your own searches.
drop policy if exists "search_history_select_own" on public.search_history;
create policy "search_history_select_own" on public.search_history
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "search_history_insert_own" on public.search_history;
create policy "search_history_insert_own" on public.search_history
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "search_history_delete_own" on public.search_history;
create policy "search_history_delete_own" on public.search_history
  for delete to authenticated using (auth.uid() = user_id);

-- saved_jobs: read, create, and delete only your own saved jobs.
drop policy if exists "saved_jobs_select_own" on public.saved_jobs;
create policy "saved_jobs_select_own" on public.saved_jobs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "saved_jobs_insert_own" on public.saved_jobs;
create policy "saved_jobs_insert_own" on public.saved_jobs
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "saved_jobs_delete_own" on public.saved_jobs;
create policy "saved_jobs_delete_own" on public.saved_jobs
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Auto-create a profile row whenever a user signs up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
