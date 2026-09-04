import { supabase } from "./supabaseClient.js?v=13";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Returns the Monday of the week containing `date`.
export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export async function loadWeekShifts(staffId, weekStart) {
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

export function renderWeek(container, weekStart, shifts) {
  container.innerHTML = "";
  const byDate = {};
  for (const s of shifts) {
    (byDate[s.shift_date] ||= []).push(s);
  }

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = formatDate(date);
    const dayShifts = byDate[key] || [];

    const row = document.createElement("div");
    row.className = "list-item";

    const label = document.createElement("div");
    const dayName = document.createElement("div");
    dayName.textContent = `${DAY_NAMES[i]} · ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
    dayName.style.fontWeight = "600";
    label.appendChild(dayName);

    if (dayShifts.length === 0) {
      const off = document.createElement("div");
      off.className = "muted";
      off.textContent = "Off";
      label.appendChild(off);
    } else {
      for (const s of dayShifts) {
        const time = document.createElement("div");
        time.className = "muted";
        time.textContent = `${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}${s.notes ? " · " + s.notes : ""}`;
        label.appendChild(time);
      }
    }

    row.appendChild(label);

    if (dayShifts.length > 0) {
      const badge = document.createElement("span");
      badge.className = "badge ok";
      badge.textContent = "Scheduled";
      row.appendChild(badge);
    }

    container.appendChild(row);
  }
}
