-- ============================================================
-- Talbot Hotel HR — v5b: make user deletion clean
-- Fixes "Failed to delete user: database error" by giving every
-- foreign key that points at a staff profile a proper ON DELETE
-- rule, so removing a user tidies up their linked rows.
-- Run ONCE in the Supabase SQL Editor.
-- ============================================================

-- Rows that BELONG to the user -> delete with them (CASCADE).
alter table maintenance_requests drop constraint if exists maintenance_requests_reported_by_fkey;
alter table maintenance_requests add constraint maintenance_requests_reported_by_fkey
  foreign key (reported_by) references profiles (id) on delete cascade;

alter table cleaning_completions drop constraint if exists cleaning_completions_staff_id_fkey;
alter table cleaning_completions add constraint cleaning_completions_staff_id_fkey
  foreign key (staff_id) references profiles (id) on delete cascade;

alter table holiday_requests drop constraint if exists holiday_requests_staff_id_fkey;
alter table holiday_requests add constraint holiday_requests_staff_id_fkey
  foreign key (staff_id) references profiles (id) on delete cascade;

alter table tasks drop constraint if exists tasks_assigned_to_fkey;
alter table tasks add constraint tasks_assigned_to_fkey
  foreign key (assigned_to) references profiles (id) on delete cascade;

alter table tasks drop constraint if exists tasks_created_by_fkey;
alter table tasks add constraint tasks_created_by_fkey
  foreign key (created_by) references profiles (id) on delete cascade;

-- References where the ROW should survive -> just clear the link (SET NULL).
alter table rota_shifts drop constraint if exists rota_shifts_created_by_fkey;
alter table rota_shifts add constraint rota_shifts_created_by_fkey
  foreign key (created_by) references profiles (id) on delete set null;

alter table rooms drop constraint if exists rooms_assigned_to_fkey;
alter table rooms add constraint rooms_assigned_to_fkey
  foreign key (assigned_to) references profiles (id) on delete set null;

alter table holiday_requests drop constraint if exists holiday_requests_decided_by_fkey;
alter table holiday_requests add constraint holiday_requests_decided_by_fkey
  foreign key (decided_by) references profiles (id) on delete set null;

alter table notifications drop constraint if exists notifications_recipient_id_fkey;
alter table notifications add constraint notifications_recipient_id_fkey
  foreign key (recipient_id) references profiles (id) on delete set null;
