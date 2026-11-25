const CACHE_NAME = "ori-v181";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=181",
  "./app.js?v=181",
  "./src/music-data.js",
  "./src/drum-machine.js",
  "./src/storage.js",
  "./src/arp-engine.js",
  "./src/arp-scheduler.js",
  "./src/arp-fx.js",
  "./src/arp-voices.js",
  "./src/pad-data.js",
  "./src/knob.js",
  "./ORI-icon.svg",
  "./ORI-icon.png",
  "./manifest.webmanifest",
  "./assets/drums/dead_drum/kick.wav",
  "./assets/drums/dead_drum/snare.wav",
  "./assets/drums/dead_drum/hat.wav",
  "./assets/drums/lofi_percusion/kick.wav",
  "./assets/drums/lofi_percusion/snare.wav",
  "./assets/drums/lofi_percusion/hat.wav",
  "./assets/drums/funk_br/kick.wav",
  "./assets/drums/funk_br/snare.wav",
  "./assets/drums/funk_br/perc.wav"
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
