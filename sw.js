const CACHE_NAME = "launcher-v3";

const FILES_TO_CACHE = [

  "./",
  "./index.html",
  "./manifest.json",
  "./sw.js",
  "./icon.png",

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
self.addEventListener("install", event => {

  console.log("SW install");

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
      .catch(err => console.error("Cache failed", err))
  );

});

self.addEventListener("activate", event => {

  event.waitUntil(
    clients.claim()
  );
});

self.addEventListener("fetch", event => {

  if (event.request.mode === "navigate") {

event.respondWith(
  fetch(event.request).catch(() =>
    caches.match("./index.html")
  )
);
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );

});
