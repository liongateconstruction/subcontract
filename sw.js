const CACHE = 'liongate-v91-newicon';
const ASSETS = ['./', './index.html', './manifest.json', './icon192.png', './icon512.png'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { 
      return Promise.all(ASSETS.map(function(asset){
        return c.add(asset).catch(function(err){
          console.warn('Skip caching', asset, err.message);
        });
      }));
    }).catch(function(){})
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      // ВАЖНО: удаляем ВСЕ старые кеши при активации
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ 
        console.log('Удаляю старый кеш:', k);
        return caches.delete(k); 
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('message', function(e){
  if(e.data === 'CLEAR_CACHE'){
    caches.keys().then(function(keys){
      keys.forEach(function(k){ caches.delete(k); });
    });
  }
  if(e.data === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.indexOf('jsonbin.io') !== -1) return;
  if (e.request.url.indexOf('workers.dev') !== -1) return;
  if (e.request.url.indexOf('api.anthropic.com') !== -1) return;
  if (e.request.url.indexOf('open-meteo.com') !== -1) return;
  if (e.request.url.indexOf('open.er-api.com') !== -1) return;

  var url = e.request.url;
  var isHTML = e.request.mode === 'navigate' ||
               url.endsWith('/') || url.endsWith('index.html') ||
               (e.request.headers.get('accept')||'').indexOf('text/html') !== -1;

  if (isHTML) {
    // NETWORK-FIRST для HTML: всегда свежий код
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
    // CACHE-FIRST для статики
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
          }
          return res;
        }).catch(function(){ return cached; });
      })
    );
  }
});
