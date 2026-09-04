import { supabase } from "./supabaseClient.js?v=13";
import { requireSession } from "./auth.js?v=13";
import { formatDate, addDays } from "./rota.js?v=13";

export async function requireManager() {
  const { session, profile } = await requireSession();
  if (profile.role !== "manager") {
    window.location.href = "dashboard.html";
    throw new Error("Not a manager");
  }
  return { session, profile };
}

export async function listStaff() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, department")
    .order("full_name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateStaff(id, { role, department }) {
  const { error } = await supabase.from("profiles").update({ role, department }).eq("id", id);
  if (error) throw error;
}

export async function loadWeekShiftsForStaff(staffId, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const { data, error } = await supabase
    .from("rota_shifts")
    .select("id, shift_date, start_time, end_time, notes")
    .eq("staff_id", staffId)
    .gte("shift_date", formatDate(weekStart))
    .lte("shift_date", formatDate(weekEnd))
    .order("shift_date", { ascending: true });
  if (error) throw error;
  return data;
}

// Replaces the whole week's shifts for one staff member with the given days.
// `days` is an array of { date, start_time, end_time, notes } for days that
// have a shift; days without a shift should simply be omitted.
export async function saveWeekShifts(staffId, weekStart, days, managerId) {
  const weekEnd = addDays(weekStart, 6);
  const { error: delError } = await supabase
    .from("rota_shifts")
    .delete()
    .eq("staff_id", staffId)
    .gte("shift_date", formatDate(weekStart))
    .lte("shift_date", formatDate(weekEnd));
  if (delError) throw delError;

  if (days.length === 0) return;

  const rows = days.map((d) => ({
    staff_id: staffId,
    shift_date: d.date,
    start_time: d.start_time,
    end_time: d.end_time,
    notes: d.notes || null,
    created_by: managerId,
  }));
  const { error: insError } = await supabase.from("rota_shifts").insert(rows);
  if (insError) throw insError;
}

// Log queries take an explicit [startISO, endISO) window so the manager can
// browse any day / week / month, past or present.
export async function listTimeEntries(startISO, endISO) {
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, clock_in_at, clock_out_at, staff:profiles(full_name)")
    .gte("clock_in_at", startISO).lt("clock_in_at", endISO)
    .order("clock_in_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listFireWalks(startISO, endISO) {
  const { data, error } = await supabase
    .from("fire_walk_checks")
    .select("id, checked_at, slot_hour, checklist, notes, staff:profiles(full_name)")
    .gte("checked_at", startISO).lt("checked_at", endISO)
    .order("checked_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listCleaning(startISO, endISO) {
  const { data, error } = await supabase
    .from("cleaning_completions")
    .select("id, room_number, kind, checklist, completed_at, staff:profiles(full_name)")
    .gte("completed_at", startISO).lt("completed_at", endISO)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listMaintenanceLog(startISO, endISO) {
  const { data, error } = await supabase
    .from("maintenance_requests")
    .select("id, room_number, description, status, created_at, reporter:profiles!maintenance_requests_reported_by_fkey(full_name)")
    .gte("created_at", startISO).lt("created_at", endISO)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}
