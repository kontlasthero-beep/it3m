const CACHE_NAME = 'table-curling-v29';
const APP_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './stone-blue.png',
  './stone-red.png',
  './Card_illustration/hardening.png',
  './Card_illustration/Protective barrier.png',
  './Card_illustration/release .png',
  './Card_illustration/Relocation.png',
  './Card_illustration/Structure Drop.png',
  './Card_illustration/blackhole release.png',
  './Card_illustration/Load.png',
  './Card_illustration/Bluffing.png',
  './영웅 초상화/trap master.png',
  './영웅 초상화/hunter.png',
  './영웅 초상화/big boy.png',
  './영웅 초상화/joker.png',
  './효과음/Midhit_1.wav',
  './효과음/Stronghit_1.wav',
  './효과음/Unit_death_sound_for_1.wav',
  './효과음/Unit_kill_sound_1.wav',
  './효과음/shockwave_sound_1.wav',
  './효과음/Blackhole_shockwave_1.wav',
  './배경음악/비겁한 컬링 클럽.wav'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  // Room lists, health checks and credentials must never come from the offline cache.
  if (new URL(event.request.url).pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});
