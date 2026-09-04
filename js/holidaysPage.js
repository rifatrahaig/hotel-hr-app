import { requireSession } from "./auth.js?v=13";
import { supabase } from "./supabaseClient.js?v=13";
import { toast, setLoading, showSkeleton, showEmpty, LOGO_SVG, esc } from "./ui.js?v=13";
import { notify, subscribeNotifications } from "./notifications.js?v=13";

const { profile } = await requireSession();
document.getElementById("logo-mark").innerHTML = LOGO_SVG;
subscribeNotifications(profile);

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmt = (d) => d.toISOString().slice(0, 10);
const pretty = (iso) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// ---------------- Calendar ----------------
let viewYear, viewMonth; // month is 0-based
const selected = new Set();
const today = new Date();
today.setHours(0, 0, 0, 0);
viewYear = today.getFullYear();
viewMonth = today.getMonth();

const grid = document.getElementById("cal-grid");
const title = document.getElementById("cal-title");
const summary = document.getElementById("selected-summary");

function renderCalendar() {
  title.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  grid.innerHTML = "";
  for (const d of DOW) {
    const el = document.createElement("div");
    el.className = "cal-dow";
    el.textContent = d;
    grid.appendChild(el);
  }
  const first = new Date(viewYear, viewMonth, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday-first
  for (let i = 0; i < startOffset; i++) grid.appendChild(document.createElement("div"));

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(viewYear, viewMonth, day);
    const iso = fmt(date);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cal-day";
    btn.textContent = day;
    if (date.getTime() === today.getTime()) btn.classList.add("today");
    if (date < today) btn.disabled = true;
    if (selected.has(iso)) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      if (selected.has(iso)) selected.delete(iso);
      else selected.add(iso);
      renderCalendar();
      renderSummary();
    });
    grid.appendChild(btn);
  }
}

function renderSummary() {
  if (selected.size === 0) {
    summary.textContent = "No dates selected.";
    return;
  }
  const list = [...selected].sort();
  summary.textContent =
    `${list.length} day${list.length > 1 ? "s" : ""} selected: ` + list.map(pretty).join(", ");
}

document.getElementById("cal-prev").addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});
document.getElementById("cal-next").addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});
renderCalendar();

// ---------------- Submit ----------------
document.getElementById("holiday-submit").addEventListener("click", async () => {
  if (selected.size === 0) {
    toast("Pick at least one date first.", "info");
    return;
  }
  const btn = document.getElementById("holiday-submit");
  setLoading(btn, true);
  try {
    const dates = [...selected].sort();
    const comment = document.getElementById("holiday-comment").value.trim();
    const { error } = await supabase.from("holiday_requests").insert({
      staff_id: profile.id,
      dates,
      comment: comment || null,
    });
    if (error) throw error;
    await notify({
      title: "Holiday request",
      body: `${profile.full_name} requested ${dates.length} day${dates.length > 1 ? "s" : ""} off.`,
      department: "manager",
    });
    selected.clear();
    document.getElementById("holiday-comment").value = "";
    renderCalendar();
    renderSummary();
    toast("Request submitted. Your manager has been notified.", "success");
    await renderMyRequests();
  } catch (err) {
    toast(err.message || "Could not submit request.", "error");
  } finally {
    setLoading(btn, false);
  }
});

// ---------------- My requests ----------------
const STATUS_CLASS = { pending: "warn", approved: "ok", rejected: "danger" };

async function renderMyRequests() {
  const container = document.getElementById("my-requests");
  showSkeleton(container, 2);
  try {
    const { data, error } = await supabase
      .from("holiday_requests")
      .select("id, dates, comment, status, created_at")
      .eq("staff_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    container.innerHTML = "";
    if (!data.length) {
      showEmpty(container, "No holiday requests yet.");
      return;
    }
    for (const r of data) {
      const row = document.createElement("div");
      row.className = "list-item";
      const dates = (r.dates || []).map(pretty).join(", ");
      row.innerHTML = `
        <div style="min-width:0;">
          <div style="font-weight:600;">${dates}</div>
          <div class="muted">${esc(r.comment || "")}</div>
        </div>
        <span class="badge ${STATUS_CLASS[r.status]}">${r.status.charAt(0).toUpperCase() + r.status.slice(1)}</span>
      `;
      container.appendChild(row);
    }
  } catch (err) {
    showEmpty(container, "Couldn't load requests.");
  }
}
renderMyRequests();

// ---------------- Manager approvals ----------------
async function renderApprovals() {
  if (profile.role !== "manager") return;
  document.getElementById("approvals-card").classList.remove("hidden");
  const container = document.getElementById("approvals-list");
  showSkeleton(container, 2);
  try {
    const { data, error } = await supabase
      .from("holiday_requests")
      .select("id, dates, comment, status, staff_id, staff:profiles!holiday_requests_staff_id_fkey(full_name)")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;
    container.innerHTML = "";
    if (!data.length) {
      showEmpty(container, "No pending requests.");
      return;
    }
    for (const r of data) {
      const row = document.createElement("div");
      row.className = "list-item";
      row.style.flexWrap = "wrap";
      const dates = (r.dates || []).map(pretty).join(", ");
      const info = document.createElement("div");
      info.style.width = "100%";
      info.innerHTML = `
        <div style="font-weight:600;">${esc(r.staff?.full_name || "Staff")}</div>
        <div class="muted">${dates}${r.comment ? " · " + esc(r.comment) : ""}</div>
      `;
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:8px;width:100%;margin-top:8px;";
      const approve = document.createElement("button");
      approve.className = "btn small success";
      approve.style.flex = "1";
      approve.textContent = "Approve";
      const reject = document.createElement("button");
      reject.className = "btn small danger";
      reject.style.flex = "1";
      reject.textContent = "Reject";

      async function decide(status) {
        setLoading(approve, true);
        setLoading(reject, true);
        try {
          const { error } = await supabase
            .from("holiday_requests")
            .update({ status, decided_by: profile.id, decided_at: new Date().toISOString() })
            .eq("id", r.id);
          if (error) throw error;
          await notify({
            title: "Holiday request " + status,
            body: `Your holiday request (${(r.dates || []).length} day${(r.dates || []).length > 1 ? "s" : ""}) was ${status}.`,
            recipientId: r.staff_id,
          });
          toast(`Request ${status}.`, "success");
          await renderApprovals();
        } catch (err) {
          toast(err.message || "Could not update request.", "error");
          setLoading(approve, false);
          setLoading(reject, false);
        }
      }
      approve.addEventListener("click", () => decide("approved"));
      reject.addEventListener("click", () => decide("rejected"));

      actions.appendChild(approve);
      actions.appendChild(reject);
      row.appendChild(info);
      row.appendChild(actions);
      container.appendChild(row);
    }
  } catch (err) {
    showEmpty(container, "Couldn't load pending requests.");
  }
}
renderApprovals();

// Live: refresh approvals when requests change
supabase
  .channel("holidays-live")
  .on("postgres_changes", { event: "*", schema: "public", table: "holiday_requests" }, () => {
    renderMyRequests();
    renderApprovals();
  })
  .subscribe();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
