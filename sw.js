const CACHE_NAME = "launcher-v4";

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

// INSTALL
self.addEventListener("install", event => {

  event.waitUntil(

    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())

  );

});

// ACTIVATE
self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys => {

      return Promise.all(

        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))

      );

    })

  );

  self.clients.claim();

});

// FETCH (CACHE FIRST)
self.addEventListener("fetch", event => {

  event.respondWith(

    caches.match(event.request)
      .then(cached => {

        if (cached) {
          return cached;
        }

        return fetch(event.request)
          .then(response => {

            // Cache successful GET requests
            if (
              event.request.method === "GET" &&
              response.status === 200
            ) {

              const responseClone = response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseClone);
                });

            }

            return response;

          });

      })

  );

});