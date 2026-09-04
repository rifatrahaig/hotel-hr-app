-- HR App database schema for Supabase (Postgres)
-- Run this whole file once in your Supabase project's SQL Editor.

-- =========================================================
-- 1. PROFILES
-- One row per staff member, linked 1:1 to Supabase auth.users.
-- =========================================================
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('staff', 'manager')),
  department text not null default 'general' check (department in ('general', 'night', 'housekeeping')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
-- New users default to 'staff' / 'general' - a manager promotes/reassigns them afterwards.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Helper: is the current user a manager?
create or replace function is_manager()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'manager'
  );
$$ language sql security definer stable set search_path = public;

alter table profiles enable row level security;

create policy "profiles: read own row" on profiles
  for select using (id = auth.uid());

create policy "profiles: managers read all" on profiles
  for select using (is_manager());

create policy "profiles: managers update all" on profiles
  for update using (is_manager());

-- =========================================================
-- 2. ROTA SHIFTS
-- Weekly schedule entries. Managers create/edit; staff read their own.
-- =========================================================
create table if not exists rota_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_rota_shifts_staff_date on rota_shifts (staff_id, shift_date);

alter table rota_shifts enable row level security;

create policy "rota: staff read own shifts" on rota_shifts
  for select using (staff_id = auth.uid());

create policy "rota: managers read all" on rota_shifts
  for select using (is_manager());

create policy "rota: managers write all" on rota_shifts
  for insert with check (is_manager());

create policy "rota: managers update all" on rota_shifts
  for update using (is_manager());

create policy "rota: managers delete all" on rota_shifts
  for delete using (is_manager());

-- =========================================================
-- 3. TIME ENTRIES (clock in / clock out)
-- =========================================================
create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_time_entries_staff on time_entries (staff_id, clock_in_at desc);

alter table time_entries enable row level security;

create policy "time: staff read own entries" on time_entries
  for select using (staff_id = auth.uid());

create policy "time: staff insert own entries" on time_entries
  for insert with check (staff_id = auth.uid());

create policy "time: staff update own open entry" on time_entries
  for update using (staff_id = auth.uid());

create policy "time: managers read all" on time_entries
  for select using (is_manager());

-- =========================================================
-- 4. FIRE WALK CHECKS (night staff, hourly patrol log)
-- =========================================================
create table if not exists fire_walk_checks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  checked_at timestamptz not null default now(),
  location text not null,
  photo_url text not null,
  notes text
);

create index if not exists idx_fire_walk_staff_time on fire_walk_checks (staff_id, checked_at desc);

alter table fire_walk_checks enable row level security;

create policy "firewalk: staff read own checks" on fire_walk_checks
  for select using (staff_id = auth.uid());

create policy "firewalk: staff insert own checks" on fire_walk_checks
  for insert with check (staff_id = auth.uid());

create policy "firewalk: managers read all" on fire_walk_checks
  for select using (is_manager());

-- =========================================================
-- 5. HOUSEKEEPING LOGS
-- =========================================================
create table if not exists housekeeping_logs (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id) on delete cascade,
  area text not null,
  completed_at timestamptz not null default now(),
  photo_url text,
  notes text
);

create index if not exists idx_housekeeping_staff_time on housekeeping_logs (staff_id, completed_at desc);

alter table housekeeping_logs enable row level security;

create policy "housekeeping: staff read own logs" on housekeeping_logs
  for select using (staff_id = auth.uid());

create policy "housekeeping: staff insert own logs" on housekeeping_logs
  for insert with check (staff_id = auth.uid());

create policy "housekeeping: managers read all" on housekeeping_logs
  for select using (is_manager());

-- =========================================================
-- 6. STORAGE (photos for fire walk + housekeeping)
-- Run this after the SQL above. Creates one private bucket; each user
-- uploads into a folder named after their own user id.
-- =========================================================
insert into storage.buckets (id, name, public)
values ('hr-photos', 'hr-photos', false)
on conflict (id) do nothing;

create policy "hr-photos: users upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hr-photos: users read own folder"
  on storage.objects for select
  using (
    bucket_id = 'hr-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "hr-photos: managers read all"
  on storage.objects for select
  using (
    bucket_id = 'hr-photos'
    and is_manager()
  );
