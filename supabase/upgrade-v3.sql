-- ============================================================
-- Talbot Hotel HR — v3 upgrade
-- Run ONCE in the Supabase SQL Editor (after upgrade-v2.sql).
-- Adds: per-housekeeper room assignment + task assignments.
-- ============================================================

-- 1. Let all signed-in staff read colleague names (needed for
-- assignment dropdowns and "reported by" labels).
drop policy if exists "profiles: staff read all" on profiles;
create policy "profiles: staff read all" on profiles
  for select using (auth.uid() is not null);

-- 2. Room assignment: which housekeeper is responsible today.
alter table rooms add column if not exists assigned_to uuid references profiles (id);

-- 3. Tasks assigned to a specific housekeeper.
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  assigned_to uuid not null references profiles (id),
  created_by uuid not null references profiles (id),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table tasks enable row level security;
create policy "tasks: staff read" on tasks for select using (auth.uid() is not null);
create policy "tasks: staff insert" on tasks for insert with check (created_by = auth.uid());
create policy "tasks: staff update" on tasks for update using (auth.uid() is not null);

-- 4. Live sync for tasks.
alter publication supabase_realtime add table tasks;
