const CACHE_NAME = "ori-v114";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=111",
  "./app.js?v=111",
  "./src/music-data.js",
  "./src/drum-machine.js",
  "./src/storage.js",
  "./src/arp-engine.js",
  "./src/arp-scheduler.js",
  "./src/knob.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
