const CACHE_NAME = 'second-chance-v59';
const APP_FILES = [
  './',
  './index.html',
  './tutorial-story.js',
  './ai-planner.js',
  './ai-planner-worker.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './stone-blue.png',
  './stone-red.png',
  './Trigger_illustration/v3-simple/blackhole.png',
  './Trigger_illustration/v3-simple/pulse.png',
  './Trigger_illustration/v3-simple/hardening.png',
  './Trigger_illustration/v3-simple/guard.png',
  './Trigger_illustration/v3-simple/empty.png',
  './Card_illustration/hardening.png',
  './Card_illustration/Protective barrier.png',
  './Card_illustration/release .png',
  './Card_illustration/Relocation.png',
  './Card_illustration/Structure Drop.png',
  './Card_illustration/blackhole release.png',
  './Card_illustration/Load.png',
  './Card_illustration/Bluffing.png',
  './Card_illustration/Escape.png',
  './Card_illustration/Data Barrier-v5.png',
  './영웅 초상화/trap master.png',
  './영웅 초상화/hunter.png',
  './영웅 초상화/big boy.png',
  './영웅 초상화/joker.png',
  './효과음/충돌과 타이머/Midhit_1.wav',
  './효과음/Unit_death_sound_for_1.wav',
  './효과음/Unit_kill_sound_1.wav',
  './효과음/카드와 트리거/shockwave_sound_1.wav',
  './효과음/카드와 트리거/Blackhole_shockwave_1.wav',
  './효과음/화면과 진행/heavy_selction sound_General Selection1792409221097.mp3',
  './효과음/화면과 진행/heavy_selction sound_Important Selection1792409221097.mp3',
  './배경음악/Beyond_the_Threshold_2026-10-19T112131.mp3',
  './배경음악/비겁한 컬링 클럽.wav',
  './효과음/화면과 진행/SecondChance_GameStart_ElevenLabs_Draft.mp3',
  './효과음/ElevenLabs_Drafts/connected.mp3',
  './효과음/ElevenLabs_Drafts/speed-slow-v2.mp3',
  './효과음/ElevenLabs_Drafts/speed-restore-v1.mp3',
  './효과음/ElevenLabs_Drafts/deal.mp3',
  './효과음/ElevenLabs_Drafts/hero-select.mp3',
  './효과음/ElevenLabs_Drafts/power-meter-start.mp3',
  './효과음/ElevenLabs_Drafts/power-lock-energy-v2.mp3',
  './효과음/ElevenLabs_Drafts/stone-launch.mp3',
  './효과음/ElevenLabs_Drafts/launch-light.mp3',
  './효과음/ElevenLabs_Drafts/launch-medium.mp3',
  './효과음/ElevenLabs_Drafts/launch-heavy.mp3',
  './효과음/ElevenLabs_Drafts/unit-death.mp3',
  './효과음/ElevenLabs_Drafts/ammo-fire-rifle-1-5s.mp3',
  './효과음/ElevenLabs_Drafts/turn-change.mp3',
  './효과음/ElevenLabs_Drafts/victory.mp3',
  './효과음/ElevenLabs_Drafts/victory-sting.mp3',
  './효과음/ElevenLabs_Drafts/defeat-sting.mp3',
  './효과음/ElevenLabs_Drafts/hardening-freeze-v2.mp3',
  './효과음/ElevenLabs_Drafts/guard-orbit-v2.mp3',
  './효과음/ElevenLabs_Drafts/pulse-release.mp3',
  './효과음/ElevenLabs_Drafts/pulse-charge-v1.mp3',
  './효과음/ElevenLabs_Drafts/reposition-gear-v2.mp3',
  './효과음/ElevenLabs_Drafts/structure-drop-iron-v2.mp3',
  './효과음/ElevenLabs_Drafts/blackhole-release.mp3',
  './효과음/ElevenLabs_Drafts/ammo-load.mp3',
  './효과음/ElevenLabs_Drafts/bluffing-sand-v2.mp3',
  './효과음/ElevenLabs_Drafts/escape-teleport-v2.mp3',
  './효과음/ElevenLabs_Drafts/trigger-place-v1.mp3',
  './효과음/ElevenLabs_Drafts/data-barrier-form-v1.mp3',
  './효과음/ElevenLabs_Drafts/strong-impact-v2.mp3',
  './효과음/ElevenLabs_Drafts/card-effect.mp3',
  './효과음/ElevenLabs_Drafts/wall-impact.mp3',
  './효과음/ElevenLabs_Drafts/guard-impact.mp3',
  './효과음/ElevenLabs_Drafts/timer-warning.mp3',
  './효과음/ElevenLabs_Drafts/timer-tick.mp3'
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
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request)));
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
