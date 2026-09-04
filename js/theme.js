// Theme management: system (default) / light / dark, persisted per device.

export function getTheme() {
  return localStorage.getItem("theme") || "system";
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark" || theme === "light") {
    root.dataset.theme = theme;
  } else {
    delete root.dataset.theme;
  }
}

export function setTheme(theme) {
  localStorage.setItem("theme", theme);
  applyTheme(theme);
}

export function toggleTheme() {
  // Cycle: from whatever is showing now, flip to the opposite explicit theme.
  const current = getTheme();
  let showingDark;
  if (current === "dark") showingDark = true;
  else if (current === "light") showingDark = false;
  else showingDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const next = showingDark ? "light" : "dark";
  setTheme(next);
  return next;
}

applyTheme(getTheme());

// When a new version of the app is deployed, the new service worker takes
// control and fires "controllerchange". Reload once so the page always runs a
// single, consistent version of the code (this is what prevents the
// half-old/half-new blank page after an update).
if ("serviceWorker" in navigator) {
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
