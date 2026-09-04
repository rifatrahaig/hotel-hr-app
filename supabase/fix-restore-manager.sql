-- Restores Rifat Raha to Manager / Reception.
-- Run once in the Supabase SQL Editor. (Service role bypasses the
-- manager-only rule that blocks this from inside the app.)
update profiles
set role = 'manager', department = 'reception'
where full_name = 'Rifat Raha';
