import { supabase } from "./supabaseClient.js?v=13";

export async function getOpenEntry(staffId) {
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, clock_in_at")
    .eq("staff_id", staffId)
    .is("clock_out_at", null)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function clockIn(staffId) {
  const { data, error } = await supabase
    .from("time_entries")
    .insert({ staff_id: staffId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function clockOut(entryId) {
  const { data, error } = await supabase
    .from("time_entries")
    .update({ clock_out_at: new Date().toISOString() })
    .eq("id", entryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getRecentEntries(staffId, limit = 10) {
  const { data, error } = await supabase
    .from("time_entries")
    .select("id, clock_in_at, clock_out_at")
    .eq("staff_id", staffId)
    .order("clock_in_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const s = String(totalSeconds % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}
