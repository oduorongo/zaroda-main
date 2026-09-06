// Minimal service worker — required by Chrome/Edge/Android before they'll fire
// beforeinstallprompt at all. Deliberately does no caching (this app is API-driven
// and mostly used online); it just needs to exist and control the page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {}); // no-op — pass every request straight through
