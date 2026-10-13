/* global self, fetch */
// Minimal service worker: it makes TripBoard installable and a share target.
// Every request goes to the network and nothing is cached.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) =>
  event.waitUntil(self.clients.claim()),
)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})
