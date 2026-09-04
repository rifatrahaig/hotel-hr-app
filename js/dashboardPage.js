import { requireSession } from "./auth.js?v=13";
import { getWeekStart, addDays, formatDate, loadWeekShifts, renderWeek } from "./rota.js?v=13";
import { getOpenEntry, clockIn, clockOut, getRecentEntries, formatDuration } from "./clock.js?v=13";
import { FIRE_QUESTIONS, slotLabel, buildSlots, getTonightChecks, logFireWalk } from "./firewalk.js?v=13";
import { toast, setLoading, showSkeleton, showEmpty, LOGO_SVG, ICONS, esc } from "./ui.js?v=13";
import { initMenu } from "./menu.js?v=13";
import { subscribeNotifications, notify } from "./notifications.js?v=13";
import { supabase } from "./supabaseClient.js?v=13";

const { session, profile } = await requireSession();
const staffId = session.user.id;

document.getElementById("logo-mark").innerHTML = LOGO_SVG;
document.getElementById("staff-name").textContent = profile.full_name;
document.getElementById("staff-meta").textContent =
  `${profile.role === "manager" ? "Manager" : "Staff"} · ${profile.department}`;

// SVG nav icons (professional design - no emojis)
document.querySelectorAll(".nav-icon[data-icon]").forEach((el) => {
  el.innerHTML = ICONS[el.dataset.icon] || "";
});

initMenu();
subscribeNotifications(profile);

if (profile.role === "manager") {
  document.getElementById("admin-link").classList.remove("hidden");
}
if (profile.department === "night") {
  document.getElementById("nav-firewalk").classList.remove("hidden");
}

// ---------------- Tab switching ----------------
const tabButtons = document.querySelectorAll(".bottom-nav button");
const panels = document.querySelectorAll(".tab-panel");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    panels.forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------------- My tasks (assigned to me) ----------------
const myTasksCard = document.getElementById("my-tasks-card");
const myTasksList = document.getElementById("my-tasks-list");

async function renderMyTasks() {
  let tasks;
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, description, status, created_by, creator:profiles!tasks_created_by_fkey(full_name)")
      .eq("assigned_to", staffId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error; // tasks table may not exist yet on old DBs
    tasks = data;
  } catch (_) {
    myTasksCard.classList.add("hidden");
    return;
  }
  if (!tasks.length) {
    myTasksCard.classList.add("hidden");
    return;
  }
  myTasksCard.classList.remove("hidden");
  myTasksList.innerHTML = "";
  for (const t of tasks) {
    const row = document.createElement("div");
    row.className = "list-item";
    row.style.flexWrap = "wrap";
    const info = document.createElement("div");
    info.style.width = "100%";
    info.innerHTML = `
      <div style="font-weight:600;">${esc(t.description)}</div>
      <div class="muted">From ${esc(t.creator?.full_name || "management")}</div>
    `;
    const btn = document.createElement("button");
    btn.className = "btn small";
    btn.style.marginTop = "8px";
    btn.textContent = "Mark done";
    btn.addEventListener("click", async () => {
      setLoading(btn, true);
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
        await renderMyTasks();
      } catch (err) {
        setLoading(btn, false);
        toast(err.message || "Could not update task.", "error");
      }
    });
    row.appendChild(info);
    row.appendChild(btn);
    myTasksList.appendChild(row);
  }
}
renderMyTasks();
// Live: a task assigned to me appears instantly, and refreshes when tasks change.
supabase
  .channel("my-tasks-feed")
  .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => renderMyTasks())
  .subscribe();

// ---------------- Rota ----------------
let weekStart = getWeekStart();
const weekLabel = document.getElementById("week-label");
const rotaList = document.getElementById("rota-list");
const weekPrev = document.getElementById("week-prev");
const weekNext = document.getElementById("week-next");

async function renderRotaWeek() {
  const todayWeek = formatDate(getWeekStart());
  const thisWeek = formatDate(weekStart);
  weekLabel.textContent =
    thisWeek === todayWeek
      ? "This week"
      : weekStart.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  weekPrev.disabled = weekNext.disabled = true;
  showSkeleton(rotaList, 4);
  try {
    const shifts = await loadWeekShifts(staffId, weekStart);
    renderWeek(rotaList, weekStart, shifts);
  } catch (err) {
    showEmpty(rotaList, "Couldn't load your rota.");
    toast(err.message || "Couldn't load rota.", "error");
  } finally {
    weekPrev.disabled = weekNext.disabled = false;
  }
}

weekPrev.addEventListener("click", () => {
  weekStart = addDays(weekStart, -7);
  renderRotaWeek();
});
weekNext.addEventListener("click", () => {
  weekStart = addDays(weekStart, 7);
  renderRotaWeek();
});
renderRotaWeek();

// ---------------- Clock in/out ----------------
const clockBtn = document.getElementById("clock-btn");
const clockTimer = document.getElementById("clock-timer");
const clockStatus = document.getElementById("clock-status");
const clockHistory = document.getElementById("clock-history");
let openEntry = null;
let timerHandle = null;

function tickTimer() {
  if (!openEntry) {
    clockTimer.textContent = "00:00:00";
    return;
  }
  clockTimer.textContent = formatDuration(Date.now() - new Date(openEntry.clock_in_at).getTime());
}

function refreshClockUI() {
  clearInterval(timerHandle);
  if (openEntry) {
    clockBtn.textContent = "Clock Out";
    clockBtn.classList.add("danger");
    clockTimer.classList.add("running");
    clockStatus.textContent = `Clocked in at ${new Date(openEntry.clock_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    tickTimer();
    timerHandle = setInterval(tickTimer, 1000);
  } else {
    clockBtn.textContent = "Clock In";
    clockBtn.classList.remove("danger");
    clockTimer.classList.remove("running");
    clockStatus.textContent = "Not clocked in";
    clockTimer.textContent = "00:00:00";
  }
}

async function renderClockHistory() {
  const entries = await getRecentEntries(staffId, 10);
  clockHistory.innerHTML = "";
  if (entries.length === 0) {
    showEmpty(clockHistory, "No shifts logged yet");
    return;
  }
  for (const e of entries) {
    const row = document.createElement("div");
    row.className = "list-item";
    const inTime = new Date(e.clock_in_at);
    const outTime = e.clock_out_at ? new Date(e.clock_out_at) : null;
    row.innerHTML = `
      <div>
        <div style="font-weight:600;">${inTime.toLocaleDateString(undefined, { day: "numeric", month: "short" })}</div>
        <div class="muted">${inTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${outTime ? outTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "..."}</div>
      </div>
      ${outTime ? "" : '<span class="badge ok">Active</span>'}
    `;
    clockHistory.appendChild(row);
  }
}

clockBtn.addEventListener("click", async () => {
  const clockingIn = !openEntry;
  setLoading(clockBtn, true);
  try {
    if (openEntry) {
      await clockOut(openEntry.id);
      openEntry = null;
      toast("Clocked out. Have a good rest.", "success");
    } else {
      openEntry = await clockIn(staffId);
      toast("Clocked in. Have a great shift.", "success");
    }
    setLoading(clockBtn, false);
    refreshClockUI();
    await renderClockHistory();
  } catch (err) {
    setLoading(clockBtn, false);
    refreshClockUI();
    toast(err.message || `Could not clock ${clockingIn ? "in" : "out"}.`, "error");
  }
});

(async () => {
  showSkeleton(clockHistory, 3);
  try {
    openEntry = await getOpenEntry(staffId);
    refreshClockUI();
    await renderClockHistory();
  } catch (err) {
    showEmpty(clockHistory, "Couldn't load clock history.");
    toast(err.message || "Couldn't load clock data.", "error");
  }
})();

// ---------------- Fire walk (hourly, 12am-6am) ----------------
if (profile.department === "night") {
  const fwStatus = document.getElementById("firewalk-status");
  const fwSlots = document.getElementById("fw-slots");
  const fwFormCard = document.getElementById("fw-form-card");
  const fwFormTitle = document.getElementById("fw-form-title");
  const fwQuestions = document.getElementById("fw-questions");
  const fwActivity = document.getElementById("fw-activity");
  const fwSubmit = document.getElementById("fw-submit");

  const SLOT_BADGE = {
    done: '<span class="badge ok">Done</span>',
    active: '<span class="badge danger">Due now</span>',
    upcoming: '<span class="badge">Upcoming</span>',
    missed: '<span class="badge warn">Missed</span>',
  };

  let answers = new Array(FIRE_QUESTIONS.length).fill(null);
  let activeHour = null;

  // Build the yes/no question UI once.
  function buildQuestionUI() {
    fwQuestions.innerHTML = "";
    FIRE_QUESTIONS.forEach((q, i) => {
      const wrap = document.createElement("div");
      wrap.className = "check-q";
      wrap.innerHTML = `<p>${i + 1}. ${q}</p>`;
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
        });
        opts.appendChild(b);
      }
      wrap.appendChild(opts);
      fwQuestions.appendChild(wrap);
    });
  }

  async function renderFireWalk() {
    let checks;
    try {
      checks = await getTonightChecks(staffId);
    } catch (err) {
      fwStatus.textContent = "Couldn't load fire walk.";
      return;
    }
    const doneHours = new Set(checks.map((c) => c.slot_hour));
    const slots = buildSlots(doneHours);
    const active = slots.find((s) => s.state === "active");
    const missed = slots.filter((s) => s.state === "missed").length;

    // Status line
    if (active) {
      fwStatus.innerHTML = `<span class="badge danger">Due now</span> Complete the ${slotLabel(active.hour)} fire walk.`;
    } else if (slots.every((s) => s.state === "upcoming")) {
      fwStatus.innerHTML = `<span class="badge">Not started</span> Fire walks begin at 12:00 AM.`;
    } else if (slots.every((s) => s.state === "done" || s.state === "upcoming")) {
      fwStatus.innerHTML = `<span class="badge ok">On track</span> All checks so far are done.`;
    } else {
      fwStatus.innerHTML = missed
        ? `<span class="badge warn">${missed} missed</span> Catch up on the next check.`
        : `<span class="badge ok">On track</span>`;
    }

    // Slot list
    fwSlots.innerHTML = "";
    for (const s of slots) {
      const row = document.createElement("div");
      row.className = "list-item";
      const done = checks.find((c) => c.slot_hour === s.hour);
      const issues = done ? (done.checklist || []).filter((q) => q.answer === "No").length : 0;
      row.innerHTML = `
        <div>
          <div style="font-weight:600;">${slotLabel(s.hour)}</div>
          <div class="muted">${done ? (issues ? issues + " issue(s) noted" : "All clear") + (done.notes ? " · " + esc(done.notes) : "") : ""}</div>
        </div>
        ${SLOT_BADGE[s.state]}
      `;
      fwSlots.appendChild(row);
    }

    // Show the checklist form only when a slot is active
    if (active) {
      activeHour = active.hour;
      fwFormTitle.textContent = `${slotLabel(active.hour)} fire walk`;
      fwFormCard.style.display = "";
    } else {
      activeHour = null;
      fwFormCard.style.display = "none";
    }
  }

  fwSubmit.addEventListener("click", async () => {
    if (activeHour === null) return;
    if (answers.some((a) => a === null)) {
      toast("Answer every question first.", "info");
      return;
    }
    const activity = fwActivity.value.trim();
    if (!activity) {
      toast("Write any activity (or 'None').", "info");
      return;
    }
    setLoading(fwSubmit, true);
    try {
      const checklist = FIRE_QUESTIONS.map((q, i) => ({ question: q, answer: answers[i] }));
      await logFireWalk(staffId, activeHour, checklist, activity);
      answers = new Array(FIRE_QUESTIONS.length).fill(null);
      fwActivity.value = "";
      buildQuestionUI();
      await renderFireWalk();
      toast("Fire walk logged.", "success");
    } catch (err) {
      toast(err.message || "Could not log fire walk.", "error");
    } finally {
      setLoading(fwSubmit, false);
    }
  });

  buildQuestionUI();
  showSkeleton(fwSlots, 3);
  renderFireWalk();
  // Re-evaluate which slot is active as time passes while the tab is open.
  setInterval(renderFireWalk, 30000);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
