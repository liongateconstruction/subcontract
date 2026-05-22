const CACHE = 'liongate-v54';
const ASSETS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(ASSETS); }).catch(function(){})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf('jsonbin.io') !== -1) return;

  var url = e.request.url;
  var isHTML = e.request.mode === 'navigate' ||
               url.endsWith('/') || url.endsWith('index.html') ||
               (e.request.headers.get('accept')||'').indexOf('text/html') !== -1;

  if (isHTML) {
    // NETWORK-FIRST для HTML: всегда свежий код, fallback на кэш если нет интернета
    e.respondWith(
      fetch(e.request, {cache: 'no-store'}).then(function(res) {
        if (res.ok) {
          var clone = res.clone();
          caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        }
        return res;
      }).catch(function() {
        return caches.match(e.request).then(function(c){ return c || caches.match('./index.html'); });
      })
    );
  } else {
    // CACHE-FIRST для статики (иконки, манифест)
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        });
      })
    );
  }
});

// Слушаем сообщение от страницы — принудительный сброс кэша
self.addEventListener('message', function(e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'CLEAR_CACHE') {
    caches.keys().then(function(keys) {
      keys.forEach(function(k) { caches.delete(k); });
    });
  }
});
