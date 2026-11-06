const CACHE_NAME = "oid-shell-v1";
const SHELL = ["/login.html", "/index.html", "/suivi.html", "/manifest.json"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/auth") || url.pathname.startsWith("/signalements") || url.pathname.startsWith("/coordination") || url.pathname.startsWith("/verification") || url.pathname.startsWith("/enquete") || url.pathname.startsWith("/rapports")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
