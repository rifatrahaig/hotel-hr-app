import { supabase } from "./supabaseClient.js?v=13";

export async function getTodayLogs(staffId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("housekeeping_logs")
    .select("id, area, completed_at, photo_url, notes")
    .eq("staff_id", staffId)
    .gte("completed_at", startOfDay.toISOString())
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function logCompletion(staffId, area, photoPath, notes) {
  const { data, error } = await supabase
    .from("housekeeping_logs")
    .insert({ staff_id: staffId, area, photo_url: photoPath || null, notes: notes || null })
    .select()
    .single();
  if (error) throw error;
  return data;
}
