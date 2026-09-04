-- ============================================================
-- Talbot Hotel HR — v4 upgrade
-- Run ONCE in the Supabase SQL Editor (after upgrade-v3.sql).
-- Fire walk becomes an hourly checklist (no photos).
-- ============================================================

-- Fire walk: drop the photo/location requirement, add checklist + slot.
alter table fire_walk_checks alter column photo_url drop not null;
alter table fire_walk_checks alter column location drop not null;
alter table fire_walk_checks add column if not exists checklist jsonb;
alter table fire_walk_checks add column if not exists slot_hour int;
