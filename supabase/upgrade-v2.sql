-- ============================================================
-- Talbot Hotel HR — v2 upgrade
-- Run this ONCE in the Supabase SQL Editor (after schema.sql).
-- Adds: rooms + statuses, maintenance, cleaning checklists,
-- holiday requests, in-app notifications, new departments,
-- and realtime sync.
-- ============================================================

-- 1. New departments -----------------------------------------
alter table profiles drop constraint if exists profiles_department_check;
alter table profiles add constraint profiles_department_check
  check (department in ('general', 'night', 'housekeeping', 'maintenance', 'reception'));

-- 2. Rooms ---------------------------------------------------
create table if not exists rooms (
  room_number text primary key,
  room_type text not null check (room_type in ('family', 'twin', 'double', 'triple', 'disabled_double')),
  pax int not null,
  beds text,
  status text not null default 'vacant'
    check (status in ('vacant', 'departure', 'stayover', 'council', 'maintenance', 'ready')),
  cleaning_required boolean not null default false,
  last_ready_check date,
  updated_at timestamptz not null default now()
);

alter table rooms enable row level security;
create policy "rooms: staff read" on rooms for select using (auth.uid() is not null);
create policy "rooms: staff update" on rooms for update using (auth.uid() is not null);

-- Seed all 56 rooms (safe to re-run; skips existing rows).
insert into rooms (room_number, room_type, pax, beds) values
  ('101','family',4,'1 double + 2 singles'),('103','family',4,'1 double + 2 singles'),
  ('104','family',4,'1 double + 2 singles'),('201','family',4,'1 double + 2 singles'),
  ('204','family',4,'1 double + 2 singles'),('205','family',4,'1 double + 2 singles'),
  ('207','family',4,'1 double + 2 singles'),('208','family',4,'1 double + 2 singles'),
  ('211','family',4,'1 double + 2 singles'),('217','family',4,'1 double + 2 singles'),
  ('301','family',4,'1 double + 2 singles'),('303','family',4,'1 double + 2 singles'),
  ('304','family',4,'1 double + 2 singles'),('307','family',4,'1 double + 2 singles'),
  ('310','family',4,'1 double + 2 singles'),('311','family',4,'1 double + 2 singles'),
  ('314','family',4,'1 double + 2 singles'),('315','family',4,'1 double + 2 singles'),
  ('111','twin',2,'2 singles'),('309','twin',2,'2 singles'),('312','twin',2,'2 singles'),
  ('316','twin',2,'2 singles'),('317','twin',2,'2 singles'),('318','twin',2,'2 singles'),
  ('319','twin',2,'2 singles'),
  ('107','double',2,'1 double'),('108','double',2,'1 double'),('109','double',2,'1 double'),
  ('110','double',2,'1 double'),('112','double',2,'1 double'),('114','double',2,'1 double'),
  ('115','double',2,'1 double'),('116','double',2,'1 double'),('117','double',2,'1 double'),
  ('118','double',2,'1 double'),('119','double',2,'1 double'),('120','double',2,'1 double'),
  ('121','double',2,'1 double'),('122','double',2,'1 double'),('202','double',2,'1 double'),
  ('203','double',2,'1 double'),('209','double',2,'1 double'),('212','double',2,'1 double'),
  ('214','double',2,'1 double'),('215','double',2,'1 double'),('216','double',2,'1 double'),
  ('302','double',2,'1 double'),('305','double',2,'1 double'),('306','double',2,'1 double'),
  ('102','triple',3,'1 double + 1 single'),('105','triple',3,'1 double + 1 single'),
  ('123','triple',3,'1 double + 1 single'),('206','triple',3,'1 double + 1 single'),
  ('210','triple',3,'1 double + 1 single'),('308','triple',3,'1 double + 1 single'),
  ('106','disabled_double',2,'1 double (accessible)')
on conflict (room_number) do nothing;

-- 3. Maintenance requests ------------------------------------
create table if not exists maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  room_number text not null references rooms (room_number),
  description text not null,
  reported_by uuid not null references profiles (id),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table maintenance_requests enable row level security;
create policy "maint: staff read" on maintenance_requests for select using (auth.uid() is not null);
create policy "maint: staff insert" on maintenance_requests for insert with check (reported_by = auth.uid());
create policy "maint: staff update" on maintenance_requests for update using (auth.uid() is not null);

-- 4. Cleaning / ready-check completions (with checklist answers)
create table if not exists cleaning_completions (
  id uuid primary key default gen_random_uuid(),
  room_number text not null references rooms (room_number),
  staff_id uuid not null references profiles (id),
  kind text not null check (kind in ('departure', 'council', 'stayover', 'ready_check', 'general')),
  checklist jsonb not null,
  completed_at timestamptz not null default now()
);

alter table cleaning_completions enable row level security;
create policy "cleaning: staff read" on cleaning_completions for select using (auth.uid() is not null);
create policy "cleaning: staff insert" on cleaning_completions for insert with check (staff_id = auth.uid());

-- 5. Holiday requests ----------------------------------------
create table if not exists holiday_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references profiles (id),
  dates jsonb not null,          -- array of 'YYYY-MM-DD' strings
  comment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

alter table holiday_requests enable row level security;
create policy "holiday: read own" on holiday_requests for select using (staff_id = auth.uid());
create policy "holiday: managers read all" on holiday_requests for select using (is_manager());
create policy "holiday: insert own" on holiday_requests for insert with check (staff_id = auth.uid());
create policy "holiday: managers update" on holiday_requests for update using (is_manager());

-- 6. In-app notifications ------------------------------------
-- recipient_id null = broadcast to a department (or everyone if both null)
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles (id),
  recipient_department text,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;
create policy "notif: staff read" on notifications for select using (auth.uid() is not null);
create policy "notif: staff insert" on notifications for insert with check (auth.uid() is not null);

-- 7. Live synchronisation (realtime) -------------------------
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table maintenance_requests;
alter publication supabase_realtime add table holiday_requests;
alter publication supabase_realtime add table notifications;
