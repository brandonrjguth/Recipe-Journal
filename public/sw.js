const CACHE_PREFIX = 'recipe-journal-';
const CACHE_VERSION = `${CACHE_PREFIX}${Date.now()}`;
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
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            const responseToCache = response.clone();
            caches.open(CACHE_VERSION)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            return response;
          });
      })
  );
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
