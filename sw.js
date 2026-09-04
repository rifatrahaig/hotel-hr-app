const CACHE_NAME = "hr-app-shell-v13";
const SHELL_FILES = [
  "/index.html",
  "/dashboard.html",
  "/admin.html",
  "/rooms.html",
  "/holidays.html",
  "/settings.html",
  "/css/styles.css",
  "/js/supabaseClient.js",
  "/js/auth.js",
  "/js/config.js",
  "/js/ui.js",
  "/js/theme.js",
  "/js/menu.js",
  "/js/notifications.js",
  "/js/rota.js",
  "/js/clock.js",
  "/js/firewalk.js",
  "/js/photos.js",
  "/js/dashboardPage.js",
  "/js/roomsPage.js",
  "/js/holidaysPage.js",
  "/js/admin.js",
  "/js/adminPage.js",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-FIRST for our own pages/scripts/styles so an update always loads
// fresh code (no half-old/half-new mix that shows a blank page). The cache is
// only a fallback for when the device is offline.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
