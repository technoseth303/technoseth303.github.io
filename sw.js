const CACHE = "neon-dodge-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/game.js",
  "/manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
