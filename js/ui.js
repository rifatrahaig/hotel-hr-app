// Shared UI helpers: toast notifications, button loading states, skeletons,
// SVG icon set (no emojis - professional design).

// Escape user-controlled text before putting it in innerHTML (prevents stored
// XSS from names, notes, descriptions, comments, etc.).
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

let toastWrap = null;
function ensureToastWrap() {
  if (!toastWrap) {
    toastWrap = document.createElement("div");
    toastWrap.className = "toast-wrap";
    document.body.appendChild(toastWrap);
  }
  return toastWrap;
}

// ---------- SVG icon set ----------
const SW = 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"';
export const ICONS = {
  success: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-5"/></svg>`,
  error: `<svg viewBox="0 0 24 24" ${SW}><path d="M12 3.5 22 20H2z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r="0.4" fill="currentColor"/></svg>`,
  info: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.4" fill="currentColor"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" ${SW}><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" ${SW}><path d="M12 3s5.5 4.6 5.5 9.6a5.5 5.5 0 0 1-11 0C6.5 9.4 9 7.5 9 5c1.5 1 2.4 2.2 3 3.7C12.6 6.8 12 4.6 12 3Z"/></svg>`,
  bed: `<svg viewBox="0 0 24 24" ${SW}><path d="M3 18v-8m0 4h18v4m0-4v-2a3 3 0 0 0-3-3H10v5"/><circle cx="6.5" cy="11.5" r="1.5"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" ${SW}><rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5v1M9 10h6M9 14h6"/></svg>`,
  users: `<svg viewBox="0 0 24 24" ${SW}><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M16 5.6a3.2 3.2 0 0 1 0 5.8M17.7 14.9c1.6.7 2.6 2.3 2.9 4.6"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5.5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="18.5" r="1.7"/></svg>`,
  wrench: `<svg viewBox="0 0 24 24" ${SW}><path d="M14.5 6.5a4 4 0 0 0-5.4 5L4 16.6a2 2 0 0 0 2.8 2.9l5.2-5.2a4 4 0 0 0 5-5.4l-2.6 2.6-2.3-2.3z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" ${SW}><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" ${SW}><circle cx="12" cy="12" r="3"/><path d="M12 4.5v-2M12 21.5v-2M19.5 12h2M2.5 12h2M17.3 6.7l1.4-1.4M5.3 18.7l1.4-1.4M17.3 17.3l1.4 1.4M5.3 5.3l1.4 1.4"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" ${SW}><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5Z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" ${SW}><path d="M4 11.5 12 4l8 7.5M6 10v10h12V10"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" ${SW}><path d="M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7M17 8l4 4-4 4M21 12H10"/></svg>`,
};

/**
 * Show a transient notification.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 * @param {number} duration ms (errors linger longer by default)
 */
export function toast(message, type = "info", duration) {
  const wrap = ensureToastWrap();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.setAttribute("role", type === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.innerHTML = ICONS[type] || ICONS.info;

  const text = document.createElement("span");
  text.textContent = message;

  el.appendChild(icon);
  el.appendChild(text);
  wrap.appendChild(el);

  const ms = duration ?? (type === "error" ? 5000 : 3200);
  const remove = () => {
    el.classList.add("leaving");
    el.addEventListener("animationend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  const timer = setTimeout(remove, ms);
  el.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
  return el;
}

/** Toggle a button into/out of a loading state (spinner + disabled). */
export function setLoading(button, isLoading) {
  if (!button) return;
  if (isLoading) {
    button.classList.add("is-loading");
    button.disabled = true;
  } else {
    button.classList.remove("is-loading");
    button.disabled = false;
  }
}

/** Render N shimmer skeleton rows into a container while data loads. */
export function showSkeleton(container, rows = 3) {
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < rows; i++) {
    const s = document.createElement("div");
    s.className = "skeleton skeleton-row";
    container.appendChild(s);
  }
}

/** Render a centered spinner into a container. */
export function showSpinner(container) {
  if (container) container.innerHTML = '<div class="spinner"></div>';
}

/** Render a friendly empty state. */
export function showEmpty(container, message) {
  if (container) {
    container.innerHTML = `<div class="empty-state">${message}</div>`;
  }
}

/** Inline brand logo mark (swap this SVG for a real logo later). */
export const LOGO_SVG = `
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M4 20V9.5L12 4l8 5.5V20" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M9 20v-5h6v5" stroke="#fff" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="12" cy="10.5" r="1.15" fill="#fff"/>
</svg>`;
