/* Taste of Recovery app — service worker
   Network first, so guests always get the latest bids and content; the
   cached copy is only a fallback when venue Wi-Fi drops. Bump VERSION when
   the file list changes. */

const VERSION = "tor27-v5";
const SHELL = [
  "./",
  "index.html",
  "app.css",
  "manifest.webmanifest",
  "js/app.js",
  "js/api.js",
  "js/api-live.js",
  "js/api-demo.js",
  "js/config.js",
  "js/util.js",
  "js/content.js",
  "js/trophy.js",
  "js/host.js",
  "icons/icon-192.png",
  "../assets/event/trophy-model.js",
  "../assets/event/trophy-fallback.png",
  "../assets/vendor/three.module.min.js",
  "../assets/vendor/RoomEnvironment.js",
  "../assets/vendor/supabase.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Only same-origin files and Google Fonts; never cache API or function calls.
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== location.origin && !font) return;   // includes all Supabase traffic
  if (url.pathname.startsWith("/.netlify/")) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
