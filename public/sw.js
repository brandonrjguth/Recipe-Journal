const CACHE_PREFIX = 'recipe-journal-';
const CACHE_VERSION = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = '/';
const urlsToCache = [
  '/',
  '/main.css',
  '/loginRegister.css',
  '/newRecipe.css',
  '/recipe.css',
  '/recipeFrom.css',
  '/recipeIMG.css',
  '/recipeList.css',
  '/shoppingList.css',
  '/supportedSites.css',
  '/thumbs.css',
  '/imgs/logonew.png',
  '/imgs/add.png',
  '/imgs/edit.svg',
  '/imgs/search.svg',
  '/imgs/placeholder.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // If we got a valid response, clone it and update the cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_VERSION)
            .then(cache => {
              cache.put(event.request, responseToCache);
            })
            .catch(err => console.error('Cache update failed:', err));
          return response;
        }
        return response;
      })
      .catch(() => {
        // If the network request fails, try to get it from cache
        return caches.match(event.request)
          .then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If it's not in cache and we're offline, show offline page
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            return new Response('Network error happened', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' },
            });
          });
      })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith(CACHE_PREFIX) && 
              cacheName !== CACHE_VERSION) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
