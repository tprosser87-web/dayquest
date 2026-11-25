var CACHE = 'dayquest-v2';
var BASE = self.location.pathname.replace(/sw\.js$/, '');
var SHELL = [BASE, BASE + 'index.html', BASE + 'styles.css', BASE + 'app.js', BASE + 'ics.js', BASE + 'config.js', BASE + 'manifest.json', BASE + 'icons/apple-touch-icon.png', BASE + 'icons/icon-192.png', BASE + 'icons/icon-512.png', BASE + 'favicon.ico'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Calendar proxy is on another origin and should always go to the network
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(e.request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(e.request).then(function (r) { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(function () { return hit || c.match(BASE + 'index.html'); });
      return hit || net;
    });
  }));
});
