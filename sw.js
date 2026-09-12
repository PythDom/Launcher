const CACHE_NAME = "launcher-v7";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./sw.js",
  "./icon.png",
  "./data/shortcuts.json",

  "./icons/ttrss.png",
  "./icons/RTBF.png",
  "./icons/lecho.png",
  "./icons/RTBF - Scores.png",

  "./icons/imdb-icon.png",
  "./icons/Quai10.png",
  "./icons/premiere.png",

  "./icons/Dico academie fr.png",
  "./icons/merriam-webster150x150.png",
  "./icons/deepL.png",

  "./icons/Amazon-150x150.png",
  "./icons/Thomann.png",
  "./icons/google-play-store-app.jpg",
  "./icons/f-droid_logo.png",

  "./icons/Gemini_language_model_logo.png",
  "./icons/ChatGPT.png",
  "./icons/copilot-logo_0.png",

  "./icons/santander-bank-logo-rounded-square-icon-free-png.webp",
  "./icons/SNCB_logo.svg.png",
  "./icons/namecheap.png",
  "./icons/immich-logo.png",
  "./icons/Kitchenowl.png",
  "./icons/navidrome.webp",
  "./icons/payscap.jpg",

  "./icons/Linkedin.png",
  "./icons/spotify.webp",
  "./icons/Whatsapp.jpg",
  "./icons/fortis.webp"
];

// INSTALL — precache the app shell, icons, and a baseline copy of the data
// file so the app works fully offline from the very first load onward.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

// ACTIVATE — drop old cache versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// FETCH
// data/shortcuts.json: network-first (so an online device always sees the
// latest synced data), falling back to the cache when offline.
// Everything else: cache-first, with any new same-origin file (e.g. a newly
// added icon) picked up and cached automatically the first time it loads.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.endsWith("/data/shortcuts.json")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (event.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
