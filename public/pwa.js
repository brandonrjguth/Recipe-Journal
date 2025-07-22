if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // First check for and remove any existing registrations
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (let registration of registrations) {
        await registration.unregister();
      }

      // Register the new service worker
      const registration = await navigator.serviceWorker.register('/sw.js', {
        updateViaCache: 'none' // Prevent browser from caching the service worker file
      });
      console.log('ServiceWorker registration successful with scope:', registration.scope);

      // Handle waiting service worker
      if (registration.waiting) {
        registration.waiting.postMessage({type: 'SKIP_WAITING'});
      }

      // Handle new service worker installation
      registration.addEventListener('installing', event => {
        console.log('Service worker installing...');
      });

      // Handle service worker activation
      registration.addEventListener('activate', event => {
        console.log('Service worker activated');
      });

      // Listen for new service workers
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker available
            newWorker.postMessage({type: 'SKIP_WAITING'});
          }
        });
      });

      // Handle controller change and reload
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      // Check for updates every hour
      setInterval(() => {
        registration.update();
      }, 3600000);

    } catch (err) {
      console.error('ServiceWorker registration failed:', err);
    }
  });
}
