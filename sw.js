// 全聯條碼查詢系統 Service Worker - 2026年10月版
const CACHE_NAME = 'pxmart-barcode-10m-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './products.js',
  './products_data.js',
  './app.js',
  './manifest.json',
  './封面.jpg',
  './APP圖示.png',
  './1.卡迪那.png',
  './2.可樂果.png',
  './3.元本山.png',
  './4.1萬歲牌-1(150.180.210系列).png',
  './4.2萬歲牌-2(其他).png',
  './5.堅果飲.png',
  './6-堅果罐.海苔禮盒.png',
  './7-短銷品.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        // Cache newly fetched images on the fly
        if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg)$/i)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback if fetch fails
        return caches.match(event.request);
      });
    })
  );
});
