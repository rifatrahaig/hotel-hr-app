import { requireSession } from "./auth.js?v=13";
import { supabase } from "./supabaseClient.js?v=13";
import { toast, setLoading, showSkeleton, showEmpty, LOGO_SVG, esc } from "./ui.js?v=13";
import { notify, subscribeNotifications } from "./notifications.js?v=13";

const { profile } = await requireSession();
document.getElementById("logo-mark").innerHTML = LOGO_SVG;
subscribeNotifications(profile);

// Who can do what (managers can do everything)
const isManager = profile.role === "manager";
const canChangeStatus = isManager || ["general", "night", "reception"].includes(profile.department);
const isHousekeeping = isManager || profile.department === "housekeeping";
const isMaintenance = isManager || profile.department === "maintenance";
// Only Reception, Night and Managers may assign tasks to people.
const canAssignTasks = isManager || ["reception", "night"].includes(profile.department);
// Only Reception, Night and Managers may assign rooms to housekeepers
// (general staff can change room status but not assign housekeeping).
const canAssignRooms = isManager || ["reception", "night"].includes(profile.department);
// Maintenance staff only ever see rooms that need a maintenance fix.
const maintenanceOnly = profile.department === "maintenance" && !isManager;

// A plain housekeeper only sees the rooms assigned to them in each category,
// so they always know which rooms are theirs. Managers/reception see all.
const onlyMine = profile.department === "housekeeping" && !isManager;
const scope = (list) => (onlyMine ? list.filter((r) => r.assigned_to === profile.id) : list);

const TYPE_LABEL = {
  family: "Family",
  twin: "Twin",
  double: "Double",
  triple: "Triple",
  disabled_double: "Accessible Double",
};
const STATUSES = ["vacant", "departure", "stayover", "council", "ready", "maintenance"];
const STATUS_LABEL = {
  vacant: "Vacant",
  departure: "Departure",
  stayover: "Stayover",
  council: "Council",
  ready: "Ready",
  maintenance: "Maintenance",
};

// ---------------- Checklists ----------------
const CHECKLISTS = {
  departure: [
    "Did you replace all towels and change all bed sheets?",
    "Did you refill all caddies and amenities?",
    "Did you clean the toilet to a spotless, hotel-standard condition?",
    "Did you inspect the room thoroughly for bed bugs?",
  ],
  council: [
    "Did you replace all towels and change all bed sheets?",
    "Did you refill all caddies and amenities?",
    "Did you clean the toilet to a spotless, hotel-standard condition?",
    "Did you inspect the room thoroughly for bed bugs?",
  ],
  stayover: [
    "Did you refresh towels and tidy the beds?",
    "Did you refill amenities as needed?",
    "Is the bathroom clean to hotel standard?",
  ],
  ready_check: [
    "Is the room clean and maintained to hotel standards?",
    "Have you checked everything in the room and confirmed it is guest-ready?",
  ],
};

// ---------------- Tabs (per department) ----------------
const ALL_TABS = [
  { id: "mine", label: "My Rooms" },
  { id: "departure", label: "Departures" },
  { id: "stayover", label: "Stayovers" },
  { id: "council", label: "Council" },
  { id: "ready_check", label: "Ready Room Check" },
  { id: "cleaning", label: "Cleaning" },
  { id: "tasks", label: "Tasks" },
  { id: "maintenance", label: "Maintenance" },
  { id: "all", label: "All Rooms" },
];

let TABS;
if (maintenanceOnly) {
  // Maintenance staff ONLY see rooms that need a maintenance fix.
  TABS = ALL_TABS.filter((t) => t.id === "maintenance");
} else if (onlyMine) {
  // Housekeepers: their rooms, the cleaning categories, and their tasks.
  TABS = ALL_TABS.filter((t) =>
    ["mine", "departure", "stayover", "council", "ready_check", "cleaning", "tasks"].includes(t.id)
  );
} else {
  // Reception / general / night / managers see everything EXCEPT "My Rooms"
  // (they don't get rooms assigned to themselves, so it would always be empty).
  TABS = ALL_TABS.filter((t) => t.id !== "mine");
}
// Land on the first tab that actually has something useful, so the page never
// opens on an empty list.
let activeTab = TABS[0].id;

let rooms = [];
let maintenance = [];
let tasks = [];
let housekeepers = [];
let allStaff = [];

const segTabs = document.getElementById("seg-tabs");
const listEl = document.getElementById("rooms-list");
const maintCard = document.getElementById("maint-form-card");
const taskCard = document.getElementById("task-form-card");

function tabCount(tabId) {
  switch (tabId) {
    case "mine":
      return (
        rooms.filter((r) => r.assigned_to === profile.id).length +
        tasks.filter((t) => t.assigned_to === profile.id && t.status === "pending").length
      );
    case "departure": return scope(rooms.filter((r) => r.status === "departure")).length;
    case "stayover": return scope(rooms.filter((r) => r.status === "stayover")).length;
    case "council": return scope(rooms.filter((r) => r.status === "council")).length;
    case "ready_check": return scope(rooms.filter((r) => r.status === "vacant")).length;
    case "cleaning": return scope(rooms.filter((r) => r.cleaning_required)).length;
    case "tasks": return tasks.filter((t) => t.status === "pending" && (onlyMine ? t.assigned_to === profile.id : true)).length;
    case "maintenance": return maintenance.filter((m) => m.status !== "completed").length;
    case "all": return scope(rooms).length;
  }
  return 0;
}

function renderTabs() {
  segTabs.innerHTML = "";
  for (const t of TABS) {
    const btn = document.createElement("button");
    btn.className = "seg-tab" + (t.id === activeTab ? " active" : "");
    btn.innerHTML = `${t.label} <span class="count">${tabCount(t.id)}</span>`;
    btn.addEventListener("click", () => {
      activeTab = t.id;
      renderTabs();
      renderList();
    });
    segTabs.appendChild(btn);
  }
  // Reporting new maintenance issues is for general/night/reception/managers;
  // maintenance staff themselves just work the list.
  maintCard.style.display = activeTab === "maintenance" && canChangeStatus ? "" : "none";
  taskCard.style.display = activeTab === "tasks" && canAssignTasks ? "" : "none";
}

// ---------------- Data ----------------
async function loadAll() {
  const [roomsRes, maintRes, tasksRes, hkRes] = await Promise.all([
    supabase.from("rooms").select("*").order("room_number"),
    supabase
      .from("maintenance_requests")
      .select("*, reporter:profiles!maintenance_requests_reported_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("tasks")
      .select("*, assignee:profiles!tasks_assigned_to_fkey(full_name), creator:profiles!tasks_created_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("profiles").select("id, full_name, role, department").order("full_name"),
  ]);
  if (roomsRes.error) throw roomsRes.error;
  if (maintRes.error) throw maintRes.error;
  rooms = roomsRes.data;
  maintenance = maintRes.data;
  // Tasks/staff need upgrade-v3.sql - degrade gracefully if missing.
  tasks = tasksRes.error ? [] : tasksRes.data;
  allStaff = hkRes.error ? [] : hkRes.data;
  housekeepers = allStaff.filter((p) => p.department === "housekeeping");

  const counts = {};
  for (const r of rooms) counts[r.status] = (counts[r.status] || 0) + 1;
  document.getElementById("rooms-summary").textContent =
    `${rooms.length} rooms · ${counts.departure || 0} dep · ${counts.stayover || 0} stay · ${counts.maintenance || 0} maint`;
}

// ---------------- Room row ----------------
function roomRow(room, context) {
  const row = document.createElement("div");
  row.className = "room-row";

  const assignee = housekeepers.find((h) => h.id === room.assigned_to);
  const info = document.createElement("div");
  info.innerHTML = `
    <div class="room-num">Room ${room.room_number}</div>
    <div class="room-meta">${TYPE_LABEL[room.room_type]} · ${room.pax} guests${room.beds ? " · " + esc(room.beds) : ""}</div>
    ${assignee ? `<div class="room-meta">Assigned to ${esc(assignee.full_name)}</div>` : ""}
  `;

  const pill = document.createElement("span");
  pill.className = `status-pill status-${room.status}`;
  pill.textContent = STATUS_LABEL[room.status] + (room.cleaning_required ? " · needs cleaning" : "");

  row.appendChild(info);
  row.appendChild(pill);

  const actions = document.createElement("div");
  actions.className = "room-actions";

  // Status change (reception/general/night/manager)
  if (canChangeStatus) {
    const sel = document.createElement("select");
    for (const s of STATUSES) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = STATUS_LABEL[s];
      opt.selected = room.status === s;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", async () => {
      const prev = room.status;
      try {
        const { error } = await supabase
          .from("rooms")
          .update({ status: sel.value, updated_at: new Date().toISOString() })
          .eq("room_number", room.room_number);
        if (error) throw error;
        toast(`Room ${room.room_number}: ${STATUS_LABEL[prev]} to ${STATUS_LABEL[sel.value]}.`, "success");
        await notify({
          title: "Room status changed",
          body: `Room ${room.room_number} is now ${STATUS_LABEL[sel.value]}.`,
          department: "housekeeping",
        });
      } catch (err) {
        sel.value = prev;
        toast(err.message || "Could not update room.", "error");
      }
    });
    actions.appendChild(sel);

    // Housekeeper assignment — reception / night / manager only
    if (canAssignRooms && housekeepers.length) {
      const assignSel = document.createElement("select");
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "Unassigned";
      assignSel.appendChild(noneOpt);
      for (const h of housekeepers) {
        const opt = document.createElement("option");
        opt.value = h.id;
        opt.textContent = h.full_name;
        opt.selected = room.assigned_to === h.id;
        assignSel.appendChild(opt);
      }
      assignSel.addEventListener("change", async () => {
        const prev = room.assigned_to;
        try {
          const newAssignee = assignSel.value || null;
          const { error } = await supabase
            .from("rooms")
            .update({ assigned_to: newAssignee, updated_at: new Date().toISOString() })
            .eq("room_number", room.room_number);
          if (error) throw error;
          const name = housekeepers.find((h) => h.id === newAssignee)?.full_name;
          toast(name ? `Room ${room.room_number} assigned to ${name}.` : `Room ${room.room_number} unassigned.`, "success");
          if (newAssignee) {
            await notify({
              title: "Room assigned to you",
              body: `Room ${room.room_number} (${STATUS_LABEL[room.status]}) has been assigned to you.`,
              recipientId: newAssignee,
            });
          }
        } catch (err) {
          assignSel.value = prev || "";
          toast(err.message || "Could not assign room.", "error");
        }
      });
      actions.appendChild(assignSel);
    }

    // Cleaning request toggle
    const cleanBtn = document.createElement("button");
    cleanBtn.className = "pill-btn" + (room.cleaning_required ? " warn" : "");
    cleanBtn.textContent = room.cleaning_required ? "Cancel cleaning request" : "Request cleaning";
    cleanBtn.addEventListener("click", async () => {
      try {
        const next = !room.cleaning_required;
        const { error } = await supabase
          .from("rooms")
          .update({ cleaning_required: next, updated_at: new Date().toISOString() })
          .eq("room_number", room.room_number);
        if (error) throw error;
        if (next) {
          await notify({
            title: "Cleaning requested",
            body: `Room ${room.room_number} needs cleaning.`,
            department: "housekeeping",
          });
        }
        toast(next ? `Room ${room.room_number} added to cleaning list.` : "Cleaning request cancelled.", "success");
      } catch (err) {
        toast(err.message || "Could not update.", "error");
      }
    });
    actions.appendChild(cleanBtn);
  }

  // Housekeeping actions
  if (isHousekeeping) {
    if ((context === "ready_check" || context === "mine") && room.status === "vacant") {
      const btn = document.createElement("button");
      btn.className = "pill-btn primary";
      btn.textContent = "Ready room check";
      btn.addEventListener("click", () => openChecklist(room, "ready_check"));
      actions.appendChild(btn);
    }
    const cleanable = room.cleaning_required || ["departure", "council", "stayover"].includes(room.status);
    if (context !== "ready_check" && cleanable) {
      const btn = document.createElement("button");
      btn.className = "pill-btn primary";
      btn.textContent = "Complete cleaning";
      btn.addEventListener("click", () => {
        // Departure and Council rooms use the full 4-question checklist;
        // everything else uses the stayover cleaning checklist.
        const kind = room.status === "departure" || room.status === "council" ? room.status : "stayover";
        openChecklist(room, kind);
      });
      actions.appendChild(btn);
    }
  }

  if (actions.children.length) row.appendChild(actions);
  return row;
}

// ---------------- Checklist modal ----------------
const KIND_TITLE = {
  departure: "Departure room checklist",
  council: "Council room checklist",
  stayover: "Stayover cleaning checklist",
  ready_check: "Ready room check",
};

function openChecklist(room, kind) {
  const questions = CHECKLISTS[kind];
  const answers = new Array(questions.length).fill(null);

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <h3>${KIND_TITLE[kind]}</h3>
    <p class="modal-sub">Room ${room.room_number} · ${TYPE_LABEL[room.room_type]}</p>
  `;

  questions.forEach((q, i) => {
    const qEl = document.createElement("div");
    qEl.className = "check-q";
    qEl.innerHTML = `<p>${i + 1}. ${q}</p>`;
    const opts = document.createElement("div");
    opts.className = "check-opts";
    for (const val of ["Yes", "No"]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "check-opt " + val.toLowerCase();
      b.textContent = val;
      b.addEventListener("click", () => {
        answers[i] = val;
        opts.querySelectorAll(".check-opt").forEach((x) => x.classList.remove("selected"));
        b.classList.add("selected");
        confirmBtn.disabled = answers.some((a) => a === null);
      });
      opts.appendChild(b);
    }
    qEl.appendChild(opts);
    modal.appendChild(qEl);
  });

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "btn";
  confirmBtn.style.marginTop = "8px";
  confirmBtn.textContent = kind === "ready_check" ? "Mark room as checked" : "Mark room as complete";
  confirmBtn.disabled = true;

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn secondary";
  cancelBtn.style.marginTop = "10px";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => overlay.remove());

  confirmBtn.addEventListener("click", async () => {
    setLoading(confirmBtn, true);
    try {
      const checklist = questions.map((q, i) => ({ question: q, answer: answers[i] }));
      const { error: logError } = await supabase.from("cleaning_completions").insert({
        room_number: room.room_number,
        staff_id: profile.id,
        kind,
        checklist,
      });
      if (logError) throw logError;

      // Update the room state
      const update = { cleaning_required: false, updated_at: new Date().toISOString() };
      if (kind === "departure" || kind === "council") update.status = "ready";
      if (kind === "ready_check") {
        update.status = "ready";
        update.last_ready_check = new Date().toISOString().slice(0, 10);
      }
      const { error: roomError } = await supabase
        .from("rooms")
        .update(update)
        .eq("room_number", room.room_number);
      if (roomError) throw roomError;

      const anyNo = answers.includes("No");
      await notify({
        title: kind === "ready_check" ? "Room checked" : "Room cleaned",
        body: `Room ${room.room_number} ${kind === "ready_check" ? "passed its ready check" : "cleaning completed"} by ${profile.full_name}.`,
        department: "reception",
      });
      overlay.remove();
      toast(
        anyNo
          ? `Room ${room.room_number} recorded with issues noted. Please follow up.`
          : `Room ${room.room_number} complete.`,
        anyNo ? "info" : "success"
      );
    } catch (err) {
      toast(err.message || "Could not save checklist.", "error");
      setLoading(confirmBtn, false);
    }
  });

  modal.appendChild(confirmBtn);
  modal.appendChild(cancelBtn);
  overlay.appendChild(modal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  document.getElementById("modal-root").appendChild(overlay);
}

// ---------------- Maintenance ----------------
const MAINT_STATUS_LABEL = { pending: "Pending", in_progress: "In Progress", completed: "Completed" };
const MAINT_BADGE = { pending: "danger", in_progress: "warn", completed: "ok" };

function maintenanceRow(m) {
  const row = document.createElement("div");
  row.className = "room-row";
  const when = new Date(m.created_at).toLocaleString([], {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  const info = document.createElement("div");
  info.style.minWidth = "0";
  info.innerHTML = `
    <div class="room-num">Room ${m.room_number}</div>
    <div class="room-meta">${esc(m.description)}</div>
    <div class="room-meta">Reported by ${esc(m.reporter?.full_name || "staff")} · ${when}</div>
  `;
  const pill = document.createElement("span");
  pill.className = `badge ${MAINT_BADGE[m.status]}`;
  pill.textContent = MAINT_STATUS_LABEL[m.status];
  row.appendChild(info);
  row.appendChild(pill);

  if ((isMaintenance || isManager) && m.status !== "completed") {
    const actions = document.createElement("div");
    actions.className = "room-actions";
    const nextStatus = m.status === "pending" ? "in_progress" : "completed";
    const btn = document.createElement("button");
    btn.className = "pill-btn primary";
    btn.textContent = m.status === "pending" ? "Start work" : "Mark completed";
    btn.addEventListener("click", async () => {
      try {
        const { error } = await supabase
          .from("maintenance_requests")
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq("id", m.id);
        if (error) throw error;
        if (nextStatus === "completed") {
          const room = rooms.find((r) => r.room_number === m.room_number);
          if (room && room.status === "maintenance") {
            await supabase.from("rooms").update({ status: "vacant", updated_at: new Date().toISOString() })
              .eq("room_number", m.room_number);
          }
          await notify({
            title: "Maintenance completed",
            body: `Room ${m.room_number}: ${m.description}`,
            recipientId: m.reported_by,
          });
        }
        toast(`Request ${MAINT_STATUS_LABEL[nextStatus].toLowerCase()}.`, "success");
      } catch (err) {
        toast(err.message || "Could not update request.", "error");
      }
    });
    actions.appendChild(btn);
    row.appendChild(actions);
  }
  return row;
}

// ---------------- Tasks ----------------
function taskRow(t) {
  const row = document.createElement("div");
  row.className = "room-row";
  const when = new Date(t.created_at).toLocaleString([], {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
  const info = document.createElement("div");
  info.style.minWidth = "0";
  info.innerHTML = `
    <div style="font-weight:700;">${esc(t.description)}</div>
    <div class="room-meta">For ${esc(t.assignee?.full_name || "staff")} · from ${esc(t.creator?.full_name || "reception")} · ${when}</div>
  `;
  const pill = document.createElement("span");
  pill.className = `badge ${t.status === "completed" ? "ok" : "warn"}`;
  pill.textContent = t.status === "completed" ? "Done" : "Pending";
  row.appendChild(info);
  row.appendChild(pill);

  const canComplete = t.status === "pending" && (t.assigned_to === profile.id || isManager);
  if (canComplete) {
    const actions = document.createElement("div");
    actions.className = "room-actions";
    const btn = document.createElement("button");
    btn.className = "pill-btn primary";
    btn.textContent = "Mark done";
    btn.addEventListener("click", async () => {
      try {
        const { error } = await supabase
          .from("tasks")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("id", t.id);
        if (error) throw error;
        await notify({
          title: "Task completed",
          body: `${t.description} — done by ${profile.full_name}.`,
          recipientId: t.created_by,
        });
        toast("Task marked done.", "success");
      } catch (err) {
        toast(err.message || "Could not update task.", "error");
      }
    });
    actions.appendChild(btn);
    row.appendChild(actions);
  }
  return row;
}

const DEPT_LABEL = {
  general: "General", night: "Night", housekeeping: "Housekeeping",
  maintenance: "Maintenance", reception: "Reception",
};
const taskAssigneeSel = document.getElementById("task-assignee");
function fillTaskAssignees() {
  taskAssigneeSel.innerHTML = "";
  // Reception/Night/Manager can assign a task to any staff member.
  for (const s of allStaff) {
    if (s.id === profile.id) continue;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.full_name} (${DEPT_LABEL[s.department] || s.department})`;
    taskAssigneeSel.appendChild(opt);
  }
}

document.getElementById("task-submit").addEventListener("click", async () => {
  const desc = document.getElementById("task-desc").value.trim();
  if (!desc) {
    toast("Write the task first.", "info");
    return;
  }
  if (!taskAssigneeSel.value) {
    toast("No other staff found to assign. Add staff in Admin first.", "info");
    return;
  }
  const btn = document.getElementById("task-submit");
  setLoading(btn, true);
  try {
    const { error } = await supabase.from("tasks").insert({
      description: desc,
      assigned_to: taskAssigneeSel.value,
      created_by: profile.id,
    });
    if (error) throw error;
    document.getElementById("task-desc").value = "";
    const name = allStaff.find((s) => s.id === taskAssigneeSel.value)?.full_name || "staff";
    await notify({
      title: "New task",
      body: desc,
      recipientId: taskAssigneeSel.value,
    });
    toast(`Task assigned to ${name}.`, "success");
  } catch (err) {
    toast(err.message || "Could not create task.", "error");
  } finally {
    setLoading(btn, false);
  }
});

// Maintenance report form
const maintRoomSel = document.getElementById("maint-room");
function fillMaintRooms() {
  maintRoomSel.innerHTML = "";
  for (const r of rooms) {
    const opt = document.createElement("option");
    opt.value = r.room_number;
    opt.textContent = `Room ${r.room_number}`;
    maintRoomSel.appendChild(opt);
  }
}

document.getElementById("maint-submit").addEventListener("click", async () => {
  const desc = document.getElementById("maint-desc").value.trim();
  if (!desc) {
    toast("Describe the issue first.", "info");
    return;
  }
  const btn = document.getElementById("maint-submit");
  setLoading(btn, true);
  try {
    const { error } = await supabase.from("maintenance_requests").insert({
      room_number: maintRoomSel.value,
      description: desc,
      reported_by: profile.id,
    });
    if (error) throw error;
    document.getElementById("maint-desc").value = "";
    await notify({
      title: "Maintenance request",
      body: `Room ${maintRoomSel.value}: ${desc}`,
      department: "maintenance",
    });
    toast("Maintenance request created.", "success");
  } catch (err) {
    toast(err.message || "Could not create request.", "error");
  } finally {
    setLoading(btn, false);
  }
});

// ---------------- List rendering ----------------
function renderList() {
  listEl.innerHTML = "";

  if (activeTab === "tasks") {
    // Assigners (reception/night/manager) see all tasks; everyone else sees only theirs.
    const visible = canAssignTasks ? tasks : tasks.filter((t) => t.assigned_to === profile.id);
    const pending = visible.filter((t) => t.status === "pending");
    const done = visible.filter((t) => t.status === "completed").slice(0, 10);
    if (!pending.length && !done.length) {
      showEmpty(listEl, "No tasks yet.");
      return;
    }
    for (const t of pending) listEl.appendChild(taskRow(t));
    if (done.length) {
      const h = document.createElement("p");
      h.className = "muted";
      h.style.margin = "16px 0 4px";
      h.textContent = "Recently completed";
      listEl.appendChild(h);
      for (const t of done) listEl.appendChild(taskRow(t));
    }
    return;
  }

  if (activeTab === "mine") {
    const myRooms = rooms.filter((r) => r.assigned_to === profile.id);
    const myTasks = tasks.filter((t) => t.assigned_to === profile.id && t.status === "pending");
    if (!myRooms.length && !myTasks.length) {
      showEmpty(listEl, "Nothing assigned to you right now.");
      return;
    }
    if (myTasks.length) {
      const h = document.createElement("p");
      h.className = "muted";
      h.style.margin = "0 0 4px";
      h.textContent = "My tasks";
      listEl.appendChild(h);
      for (const t of myTasks) listEl.appendChild(taskRow(t));
    }
    if (myRooms.length) {
      const h = document.createElement("p");
      h.className = "muted";
      h.style.margin = "16px 0 4px";
      h.textContent = "My rooms";
      listEl.appendChild(h);
      for (const r of myRooms) listEl.appendChild(roomRow(r, "mine"));
    }
    return;
  }

  if (activeTab === "maintenance") {
    const open = maintenance.filter((m) => m.status !== "completed");
    const done = maintenance.filter((m) => m.status === "completed").slice(0, 10);
    if (!open.length && !done.length) {
      showEmpty(listEl, "No maintenance requests.");
      return;
    }
    for (const m of open) listEl.appendChild(maintenanceRow(m));
    if (done.length) {
      const h = document.createElement("p");
      h.className = "muted";
      h.style.margin = "16px 0 4px";
      h.textContent = "Recently completed";
      listEl.appendChild(h);
      for (const m of done) listEl.appendChild(maintenanceRow(m));
    }
    return;
  }

  let filtered;
  let context = activeTab;
  switch (activeTab) {
    case "departure": filtered = scope(rooms.filter((r) => r.status === "departure")); break;
    case "stayover": filtered = scope(rooms.filter((r) => r.status === "stayover")); break;
    case "council": filtered = scope(rooms.filter((r) => r.status === "council")); break;
    case "ready_check": filtered = scope(rooms.filter((r) => r.status === "vacant")); break;
    case "cleaning": filtered = scope(rooms.filter((r) => r.cleaning_required)); break;
    default: filtered = scope(rooms); context = "all";
  }
  if (!filtered.length) {
    const messages = onlyMine
      ? {
          departure: "No departure rooms assigned to you.",
          stayover: "No stayover rooms assigned to you.",
          council: "No council rooms assigned to you.",
          ready_check: "No ready-check rooms assigned to you.",
          cleaning: "No cleaning rooms assigned to you.",
          all: "No rooms assigned to you yet. Reception assigns your rooms.",
        }
      : {
          departure: "No departure rooms right now.",
          stayover: "No stayover rooms right now.",
          council: "No council rooms right now.",
          ready_check: "No rooms waiting for a ready check.",
          cleaning: "No rooms in the cleaning list.",
          all: "No rooms found. Run the v2 database upgrade in Supabase.",
        };
    showEmpty(listEl, messages[activeTab] || "Nothing here.");
    return;
  }
  for (const r of filtered) listEl.appendChild(roomRow(r, context));
}

// ---------------- Boot + live sync ----------------
async function refresh() {
  await loadAll();
  fillMaintRooms();
  fillTaskAssignees();
  renderTabs();
  renderList();
}

showSkeleton(listEl, 6);
try {
  await refresh();
} catch (err) {
  showEmpty(
    listEl,
    "Couldn't load rooms. Make sure the v2 database upgrade (supabase/upgrade-v2.sql) has been run."
  );
  toast(err.message || "Couldn't load rooms.", "error");
}

supabase
  .channel("rooms-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, () => refresh())
  .on("postgres_changes", { event: "*", schema: "public", table: "maintenance_requests" }, () => refresh())
  .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => refresh())
  .subscribe();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
