import { supabase } from "./supabaseClient.js?v=13";

// Fire walk is an hourly patrol, 7 slots from midnight to 6am.
export const FIRE_SLOTS = [0, 1, 2, 3, 4, 5, 6];

// Yes/No checklist questions asked at every slot.
export const FIRE_QUESTIONS = [
  "Corridors checked on all floors?",
  "Fire exits — 2nd floor clear?",
  "Fire exits — 3rd floor clear?",
  "All guest room areas checked?",
  "Car park checked?",
];

export function slotLabel(hour) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return `${h12}:00 ${ampm}`;
}

// The date whose 00:00–06:59 window the fire walks belong to. If it's already
// past 6am, the next window is tomorrow morning.
export function referenceNight(now = new Date()) {
  const ref = new Date(now);
  ref.setHours(0, 0, 0, 0);
  if (now.getHours() > 6) ref.setDate(ref.getDate() + 1);
  return ref;
}

// Build tonight's 7 slots with their live state.
// state: "done" | "active" (loggable now) | "upcoming" (locked) | "missed"
export function buildSlots(doneHours, now = new Date()) {
  const ref = referenceNight(now);
  return FIRE_SLOTS.map((hour) => {
    const start = new Date(ref);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1, 0, 0, 0);
    let state;
    if (doneHours.has(hour)) state = "done";
    else if (now < start) state = "upcoming";
    else if (now >= start && now < end) state = "active";
    else state = "missed";
    return { hour, start, end, state };
  });
}

export async function getTonightChecks(staffId, now = new Date()) {
  const ref = referenceNight(now);
  const windowEnd = new Date(ref);
  windowEnd.setHours(7, 0, 0, 0); // through 6:59am
  const { data, error } = await supabase
    .from("fire_walk_checks")
    .select("id, checked_at, slot_hour, checklist, notes")
    .eq("staff_id", staffId)
    .gte("checked_at", ref.toISOString())
    .lt("checked_at", windowEnd.toISOString())
    .order("checked_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function logFireWalk(staffId, slotHour, checklist, activity) {
  const { data, error } = await supabase
    .from("fire_walk_checks")
    .insert({
      staff_id: staffId,
      slot_hour: slotHour,
      checklist,
      notes: activity,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
