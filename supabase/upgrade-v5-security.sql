-- ============================================================
-- Talbot Hotel HR — v5 SECURITY upgrade
-- Run ONCE in the Supabase SQL Editor (after upgrade-v4.sql).
-- Verifies RLS everywhere and tightens policies so the database
-- itself enforces the same role rules as the app UI.
-- ============================================================

-- 0. Helper: current user's department (bypasses profiles RLS safely).
create or replace function staff_department()
returns text as $$
  select department from profiles where id = auth.uid();
$$ language sql security definer stable set search_path = public;

-- 1. Make sure RLS is enabled on every table (idempotent).
alter table profiles enable row level security;
alter table rota_shifts enable row level security;
alter table time_entries enable row level security;
alter table fire_walk_checks enable row level security;
alter table housekeeping_logs enable row level security;
alter table rooms enable row level security;
alter table maintenance_requests enable row level security;
alter table cleaning_completions enable row level security;
alter table holiday_requests enable row level security;
alter table notifications enable row level security;
alter table tasks enable row level security;

-- 2. TASKS — only reception / night / manager may create;
--    only the assignee, the creator, or a manager may update.
drop policy if exists "tasks: staff insert" on tasks;
create policy "tasks: assigners insert" on tasks
  for insert with check (
    created_by = auth.uid()
    and (is_manager() or staff_department() in ('reception', 'night'))
  );

drop policy if exists "tasks: staff update" on tasks;
create policy "tasks: involved update" on tasks
  for update using (
    assigned_to = auth.uid() or created_by = auth.uid() or is_manager()
  );

-- 3. MAINTENANCE — anyone may report, but only maintenance staff
--    or managers may change a request's status.
drop policy if exists "maint: staff update" on maintenance_requests;
create policy "maint: maintenance update" on maintenance_requests
  for update using (is_manager() or staff_department() = 'maintenance');

-- 4. FIRE WALK — only night staff or managers can log checks.
drop policy if exists "firewalk: staff insert own checks" on fire_walk_checks;
create policy "firewalk: night insert own" on fire_walk_checks
  for insert with check (
    staff_id = auth.uid()
    and (is_manager() or staff_department() = 'night')
  );

-- 5. CLEANING — only housekeeping or managers can record completions.
drop policy if exists "cleaning: staff insert" on cleaning_completions;
create policy "cleaning: housekeeping insert" on cleaning_completions
  for insert with check (
    staff_id = auth.uid()
    and (is_manager() or staff_department() = 'housekeeping')
  );

-- 6. NOTIFICATIONS — cap lengths so the feed can't be abused.
drop policy if exists "notif: staff insert" on notifications;
create policy "notif: staff insert capped" on notifications
  for insert with check (
    auth.uid() is not null
    and char_length(title) <= 120
    and char_length(body) <= 500
  );

-- 7. Verification — run these to inspect the result:
-- select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, cmd;
