import { getWeekStart, addDays, formatDate } from "./rota.js?v=13";
import {
  requireManager,
  listStaff,
  updateStaff,
  loadWeekShiftsForStaff,
  saveWeekShifts,
  listTimeEntries,
  listFireWalks,
  listCleaning,
  listMaintenanceLog,
} from "./admin.js?v=13";
import { toast, setLoading, showSkeleton, showSpinner, showEmpty, LOGO_SVG, ICONS, esc } from "./ui.js?v=13";
import { initMenu } from "./menu.js?v=13";
import { subscribeNotifications } from "./notifications.js?v=13";

const { session, profile } = await requireManager();
document.getElementById("logo-mark").innerHTML = LOGO_SVG;
document.getElementById("manager-name").textContent = profile.full_name;
document.querySelectorAll(".nav-icon[data-icon]").forEach((el) => {
  el.innerHTML = ICONS[el.dataset.icon] || "";
});
initMenu();
subscribeNotifications(profile);

// ---------------- Tabs ----------------
const tabButtons = document.querySelectorAll(".bottom-nav button");
const panels = document.querySelectorAll(".tab-panel");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "logs") renderLogs();
  });
});

// ---------------- Staff management ----------------
const DEPARTMENTS = ["general", "night", "housekeeping", "maintenance", "reception"];
const ROLES = ["staff", "manager"];
let staff = [];

async function renderStaffList() {
  const container = document.getElementById("staff-list");
  showSkeleton(container, 4);
  try {
    staff = await listStaff();
  } catch (err) {
    showEmpty(container, "Couldn't load staff list.");
    toast(err.message || "Couldn't load staff.", "error");
    return;
  }
  container.innerHTML = "";
  if (staff.length === 0) {
    showEmpty(container, "No staff yet. Share the app link so they can sign up.");
    return;
  }
  for (const s of staff) {
    const row = document.createElement("div");
    row.className = "list-item";
    row.style.flexWrap = "wrap";

    const roleSelect = document.createElement("select");
    roleSelect.style.flex = "1 1 0";
    roleSelect.style.minWidth = "0";
    roleSelect.style.marginBottom = "0";
    for (const r of ROLES) {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = r === "manager" ? "Manager" : "Staff";
      opt.selected = s.role === r;
      roleSelect.appendChild(opt);
    }

    const deptSelect = document.createElement("select");
    deptSelect.style.flex = "1 1 0";
    deptSelect.style.minWidth = "0";
    deptSelect.style.marginBottom = "0";
    for (const d of DEPARTMENTS) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d.charAt(0).toUpperCase() + d.slice(1);
      opt.selected = s.department === d;
      deptSelect.appendChild(opt);
    }

    const saveBtn = document.createElement("button");
    saveBtn.className = "btn small";
    saveBtn.textContent = "Save";
    saveBtn.style.flex = "1 1 100%";
    saveBtn.style.width = "100%";
    saveBtn.addEventListener("click", async () => {
      setLoading(saveBtn, true);
      try {
        await updateStaff(s.id, { role: roleSelect.value, department: deptSelect.value });
        s.role = roleSelect.value;
        s.department = deptSelect.value;
        toast(`${s.full_name} updated.`, "success");
      } catch (err) {
        toast("Could not save: " + (err.message || "unknown error"), "error");
      } finally {
        setLoading(saveBtn, false);
      }
    });

    const label = document.createElement("div");
    label.style.fontWeight = "600";
    label.style.width = "100%";
    label.textContent = s.full_name;

    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.flexWrap = "wrap";
    controls.style.gap = "8px";
    controls.style.marginTop = "8px";
    controls.style.width = "100%";
    controls.appendChild(roleSelect);
    controls.appendChild(deptSelect);
    controls.appendChild(saveBtn);

    row.appendChild(label);
    row.appendChild(controls);
    container.appendChild(row);
  }
}

// ---------------- Rota upload ----------------
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const rotaStaffSelect = document.getElementById("rota-staff");
const rotaWeekInput = document.getElementById("rota-week");
const rotaDaysContainer = document.getElementById("rota-days");

function populateStaffDropdown() {
  rotaStaffSelect.innerHTML = "";
  for (const s of staff) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.full_name;
    rotaStaffSelect.appendChild(opt);
  }
}

rotaWeekInput.value = formatDate(getWeekStart());

function buildDayRows(existingShifts = []) {
  rotaDaysContainer.innerHTML = "";
  const weekStart = getWeekStart(new Date(rotaWeekInput.value + "T00:00:00"));
  const byDate = {};
  for (const s of existingShifts) byDate[s.shift_date] = s;

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = formatDate(date);
    const existing = byDate[key];

    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.style.background = "var(--surface-2)";
    wrap.style.padding = "14px";
    wrap.dataset.date = key;

    wrap.innerHTML = `
      <h3>${DAY_LABELS[i]} · ${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</h3>
      <div class="field-row">
        <div>
          <label>Start</label>
          <input type="time" class="day-start" value="${existing ? existing.start_time.slice(0, 5) : ""}" />
        </div>
        <div>
          <label>End</label>
          <input type="time" class="day-end" value="${existing ? existing.end_time.slice(0, 5) : ""}" />
        </div>
      </div>
      <label>Notes</label>
      <textarea class="day-notes" placeholder="Optional">${esc(existing?.notes || "")}</textarea>
    `;
    rotaDaysContainer.appendChild(wrap);
  }
}

async function loadRotaForSelection() {
  if (!rotaStaffSelect.value) return;
  const weekStart = getWeekStart(new Date(rotaWeekInput.value + "T00:00:00"));
  showSpinner(rotaDaysContainer);
  try {
    const shifts = await loadWeekShiftsForStaff(rotaStaffSelect.value, weekStart);
    buildDayRows(shifts);
  } catch (err) {
    rotaDaysContainer.innerHTML = "";
    toast(err.message || "Couldn't load this week's rota.", "error");
  }
}

rotaStaffSelect.addEventListener("change", loadRotaForSelection);
rotaWeekInput.addEventListener("change", loadRotaForSelection);

document.getElementById("rota-save").addEventListener("click", async () => {
  const staffId = rotaStaffSelect.value;
  if (!staffId) {
    toast("Pick a staff member first.", "info");
    return;
  }
  const weekStart = getWeekStart(new Date(rotaWeekInput.value + "T00:00:00"));

  const days = [];
  for (const dayEl of rotaDaysContainer.children) {
    const startEl = dayEl.querySelector(".day-start");
    const endEl = dayEl.querySelector(".day-end");
    if (!startEl || !endEl) continue;
    const start = startEl.value;
    const end = endEl.value;
    const notes = dayEl.querySelector(".day-notes").value.trim();
    if (start && end) {
      days.push({ date: dayEl.dataset.date, start_time: start, end_time: end, notes });
    }
  }

  const saveBtn = document.getElementById("rota-save");
  setLoading(saveBtn, true);
  try {
    await saveWeekShifts(staffId, weekStart, days, session.user.id);
    const name = rotaStaffSelect.options[rotaStaffSelect.selectedIndex]?.text || "Staff";
    toast(`Rota saved for ${name} (${days.length} shift${days.length === 1 ? "" : "s"}).`, "success");
  } catch (err) {
    toast(err.message || "Could not save rota.", "error");
  } finally {
    setLoading(saveBtn, false);
  }
});

(async () => {
  await renderStaffList();
  populateStaffDropdown();
  await loadRotaForSelection();
})();

// ---------------- Logs (browsable Day / Week / Month) --------
let logMode = "day"; // "day" | "week" | "month"
let logOffset = 0; // 0 = current period, -1 = previous, ...
let logsBooted = false;

const FIRE_SLOTS = [0, 1, 2, 3, 4, 5, 6]; // hourly fire-walk slots, 12am–6am
const dtWhen = (iso, withDay) =>
  new Date(iso).toLocaleString([], {
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit", minute: "2-digit",
  });
const slotLbl = (h) => {
  if (h === null || h === undefined) return "";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${h < 12 ? "AM" : "PM"}`;
};
const KIND_LABEL = {
  departure: "Departure clean", council: "Council clean", stayover: "Stayover clean",
  ready_check: "Ready check", general: "Cleaning",
};
const MAINT_STATUS = { pending: "Pending", in_progress: "In progress", completed: "Completed" };
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

// Compute the [start, end) window and a friendly label for the current mode+offset.
function computeRange() {
  const now = new Date();
  let start, end, label;
  if (logMode === "day") {
    start = startOfDay(now);
    start.setDate(start.getDate() + logOffset);
    end = new Date(start); end.setDate(end.getDate() + 1);
    if (logOffset === 0) label = "Today";
    else if (logOffset === -1) label = "Yesterday";
    else label = start.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
  } else if (logMode === "week") {
    const monday = startOfDay(now);
    const dow = (monday.getDay() + 6) % 7; // 0 = Monday
    monday.setDate(monday.getDate() - dow + logOffset * 7);
    start = monday; end = new Date(monday); end.setDate(end.getDate() + 7);
    const endLabel = new Date(end); endLabel.setDate(endLabel.getDate() - 1);
    if (logOffset === 0) label = "This week";
    else if (logOffset === -1) label = "Last week";
    else label = `${start.toLocaleDateString([], { day: "numeric", month: "short" })} – ${endLabel.toLocaleDateString([], { day: "numeric", month: "short" })}`;
  } else {
    start = new Date(now.getFullYear(), now.getMonth() + logOffset, 1);
    end = new Date(now.getFullYear(), now.getMonth() + logOffset + 1, 1);
    label = start.toLocaleDateString([], { month: "long", year: "numeric" });
  }
  return { start, end, label };
}

function setCount(id, n) { document.getElementById(id).textContent = n; }

// For the Day mode: quick chips (Today, Yesterday, Mon…Sun of this week).
function renderDayQuickpick() {
  const wrap = document.getElementById("day-quickpick");
  wrap.innerHTML = "";
  if (logMode !== "day") { wrap.style.display = "none"; return; }
  wrap.style.display = "";
  const today = startOfDay(new Date());
  const monday = startOfDay(new Date());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const chips = [
    { label: "Today", offset: 0 },
    { label: "Yesterday", offset: -1 },
  ];
  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(d.getDate() + i);
    const off = Math.round((d - today) / 86400000);
    if (off > 0) continue; // don't offer future days
    chips.push({ label: DOW[i], offset: off });
  }
  // de-dup by offset, keep first label
  const seen = new Set();
  for (const c of chips) {
    if (seen.has(c.offset)) continue;
    seen.add(c.offset);
    const btn = document.createElement("button");
    btn.className = "seg-tab" + (c.offset === logOffset ? " active" : "");
    btn.textContent = c.label;
    btn.addEventListener("click", () => { logOffset = c.offset; renderLogs(); });
    wrap.appendChild(btn);
  }
}

async function renderLogs() {
  if (!logsBooted) {
    logsBooted = true;
    document.querySelectorAll("#log-mode .seg-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("#log-mode .seg-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        logMode = btn.dataset.mode;
        logOffset = 0;
        renderLogs();
      });
    });
    document.getElementById("period-prev").addEventListener("click", () => { logOffset -= 1; renderLogs(); });
    document.getElementById("period-next").addEventListener("click", () => { if (logOffset < 0) { logOffset += 1; renderLogs(); } });
  }

  const { start, end, label } = computeRange();
  document.getElementById("period-label").textContent = label;
  document.getElementById("period-next").disabled = logOffset >= 0;
  renderDayQuickpick();

  const startISO = start.toISOString();
  const endISO = end.toISOString();
  const clockC = document.getElementById("log-clock");
  const fwC = document.getElementById("log-firewalk");
  const hkC = document.getElementById("log-housekeeping");
  const mC = document.getElementById("log-maint");
  [clockC, fwC, hkC, mC].forEach((c) => showSkeleton(c, 2));

  try {
    const [clockEntries, fwChecks, hkLogs, maintLogs] = await Promise.all([
      listTimeEntries(startISO, endISO),
      listFireWalks(startISO, endISO),
      listCleaning(startISO, endISO),
      listMaintenanceLog(startISO, endISO),
    ]);
    const withDay = logMode !== "day";

    // Clock
    clockC.innerHTML = "";
    setCount("count-clock", clockEntries.length);
    if (!clockEntries.length) showEmpty(clockC, "No clock in/out in this period");
    for (const e of clockEntries) {
      const outTime = e.clock_out_at ? new Date(e.clock_out_at) : null;
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <div style="font-weight:600;">${esc(e.staff?.full_name || "Unknown")}</div>
          <div class="muted">${dtWhen(e.clock_in_at, withDay)} - ${outTime ? dtWhen(e.clock_out_at, false) : "..."}</div>
        </div>
        ${outTime ? "" : '<span class="badge ok">Active</span>'}
      `;
      clockC.appendChild(row);
    }

    // Fire walk — completed checks + auto-flagged MISSED slots (past windows).
    const now = Date.now();
    const fwItems = fwChecks.map((c) => ({
      at: new Date(c.checked_at).getTime(),
      done: true, staff: c.staff?.full_name, slot: c.slot_hour, checklist: c.checklist, notes: c.notes,
    }));
    // For each whole day in the window that has already passed its slot windows,
    // any of the 7 slots without a check is a "Missed Fire Walk".
    const doneByKey = new Set(fwChecks.map((c) => `${new Date(c.checked_at).toDateString()}|${c.slot_hour}`));
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      for (const slot of FIRE_SLOTS) {
        const slotTime = new Date(d); slotTime.setHours(slot, 0, 0, 0);
        const windowEnd = slotTime.getTime() + 60 * 60 * 1000; // slot's hour has fully passed
        if (windowEnd > now) continue; // not due yet / in progress
        const key = `${slotTime.toDateString()}|${slot}`;
        if (doneByKey.has(key)) continue;
        fwItems.push({ at: slotTime.getTime(), done: false, slot });
      }
    }
    fwItems.sort((a, b) => b.at - a.at);
    fwC.innerHTML = "";
    setCount("count-firewalk", fwItems.length);
    if (!fwItems.length) showEmpty(fwC, "No fire walks in this period");
    for (const it of fwItems) {
      const row = document.createElement("div");
      row.className = "list-item";
      if (it.done) {
        const issues = (it.checklist || []).filter((q) => q.answer === "No").length;
        row.innerHTML = `
          <div style="min-width:0;">
            <div style="font-weight:600;">${slotLbl(it.slot)} — ${esc(it.staff || "Night staff")}</div>
            <div class="muted">${dtWhen(it.at, withDay)}${it.notes ? " · " + esc(it.notes) : ""}</div>
          </div>
          ${issues ? `<span class="badge danger">${issues} issue${issues > 1 ? "s" : ""}</span>` : '<span class="badge ok">Done</span>'}
        `;
      } else {
        row.innerHTML = `
          <div style="min-width:0;">
            <div style="font-weight:600;">${slotLbl(it.slot)} fire walk</div>
            <div class="muted">${dtWhen(it.at, withDay)}</div>
          </div>
          <span class="badge danger">Missed</span>
        `;
      }
      fwC.appendChild(row);
    }

    // Cleaning
    hkC.innerHTML = "";
    setCount("count-housekeeping", hkLogs.length);
    if (!hkLogs.length) showEmpty(hkC, "No cleaning in this period");
    for (const h of hkLogs) {
      const issues = (h.checklist || []).filter((q) => q.answer === "No").length;
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div>
          <div style="font-weight:600;">${esc(h.staff?.full_name || "Unknown")} · Room ${esc(h.room_number)}</div>
          <div class="muted">${KIND_LABEL[h.kind] || esc(h.kind)} · ${dtWhen(h.completed_at, withDay)}</div>
        </div>
        ${issues ? `<span class="badge danger">${issues} issue${issues > 1 ? "s" : ""}</span>` : '<span class="badge ok">All clear</span>'}
      `;
      hkC.appendChild(row);
    }

    // Maintenance
    mC.innerHTML = "";
    setCount("count-maint", maintLogs.length);
    if (!maintLogs.length) showEmpty(mC, "No maintenance requests in this period");
    for (const m of maintLogs) {
      const badge = m.status === "completed" ? "ok" : m.status === "in_progress" ? "warn" : "danger";
      const row = document.createElement("div");
      row.className = "list-item";
      row.innerHTML = `
        <div style="min-width:0;">
          <div style="font-weight:600;">Room ${esc(m.room_number)}</div>
          <div class="muted">${esc(m.description)} · ${esc(m.reporter?.full_name || "staff")} · ${dtWhen(m.created_at, withDay)}</div>
        </div>
        <span class="badge ${badge}">${MAINT_STATUS[m.status]}</span>
      `;
      mC.appendChild(row);
    }
  } catch (err) {
    showEmpty(clockC, "Couldn't load logs. Tap a period to retry.");
    [fwC, hkC, mC].forEach((c) => (c.innerHTML = ""));
    toast(err.message || "Couldn't load logs.", "error");
  }
}
