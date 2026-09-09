/* CNC Cabinet Designer Pro — offline service worker v3
   v3: cache-name bump so shop PCs running the installed PWA drop the old shell and pick up
       the exploded per-cabinet report + full-door / back-material phases (was v2).
   Robust offline for plane mode: cache-first, navigation fallback, background sync safe.
   Works when served via http(s) — file:// can't use SW, but single-file build works there without SW.
*/
const CACHE = "cnc-cabinet-designer-v3";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => cache.addAll(["./", "./index.html"])))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only handle same-origin
  if (url.origin !== location.origin) return;

  // Navigation: try network first, fallback to cache index.html (SPA)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./index.html").then((c) => c || caches.match("./")))
    );
    return;
  }

  // Assets: cache-first, then network, then cache put
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // stale-while-revalidate
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
            })
            .catch(() => {})
        );
        return cached;
      }
      return fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // offline fallback for images etc
          if (req.destination === "image") return caches.match("./icon.svg");
          return Response.error();
        });
    })
  );
});

// Allow client to trigger skipWaiting
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
