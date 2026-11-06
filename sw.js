const CACHE_NAME = 'second-chance-v131';
const APP_FILES = [
  './',
  './index.html',
  './fonts/font-families.css?v=1',
  './fonts/gowunbatang/GowunBatang-Regular.ttf',
  './game-ui-kit.css?v=1',
  './lobby-motion.css?v=1',
  './game-lobby-screen/preservation-zone/preservation-zone-aerial.webp',
  './game-lobby-screen/game-title/concepts/second-chance-wordmark-concept-c-ruined-signal.png',
  './game-lobby-screen/preservation-zone/preservation-webcg.css?v=2',
  './game-lobby-screen/lobby-layout.css?v=5',
  './entry-layout.css?v=5',
  './collection-layout.css?v=3',
  './refined-card-detail-modal.css?v=3',
  './deck-flow.css?v=4',
  './map-deck-assets.css?v=1',
  './refinery-visuals.css',
  './salvage-hud-v2.css?v=3',
  './salvage-game-finish.css?v=1',
  './salvage-selection-finish.css?v=1',
  './shared-ui/deck-redesign/deck-window-v2.png',
  './shared-ui/deck-redesign/deck-slot-v2.png',
  './shared-ui/deck-redesign/deck-add-v2.png',
  './shared-ui/deck-redesign/hero-portrait-frame-v2.png',
  './shared-ui/deck-redesign/map-deck-arrow-v1.png',
  './shared-ui/deck-redesign/map-deck-plate-v1.png',
  './shared-ui/deck-redesign/map-deck-tray-v1.png',
  './shared-ui/salvage-hud-v2/panel.png',
  './shared-ui/salvage-hud-v2/panel-slate.png',
  './shared-ui/salvage-hud-v2/button.png',
  './shared-ui/salvage-hud-v2/button-compact.png',
  './shared-ui/salvage-hud-v2/button-plum.png',
  './shared-ui/salvage-hud-v2/tile.png',
  './shared-ui/salvage-hud-v2/badge.png',
  './shared-ui/salvage-hud-v2/card-frame.png',
  './game-lobby-screen/lobby-window-frame.svg',
  './game-lobby-screen/preservation-zone/preservation-webcg.js?v=2',
  './tutorial-motion.css?v=1',
  './tutorial-motion.js?v=1',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/back--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/settings--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/fire--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/power-confirm--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/modules/salvage/card-border--compact.svg',
  './shared-ui/card-border-live.svg',
  './shared-ui/card-border-hud.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/home-play--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/home-tutorial--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/home-catalog--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/home-deck--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/home-account--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/mode-browse--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/mode-code--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/mode-local--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/mode-online--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/mode-ai--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/buttons/salvage/mode-adventure--desktop--idle.svg',
  './shared-ui/expedition-ui-kit-v1/icons/search.svg',
  './shared-ui/expedition-ui-kit-v1/icons/code.svg',
  './shared-ui/expedition-ui-kit-v1/icons/people.svg',
  './shared-ui/expedition-ui-kit-v1/icons/network.svg',
  './shared-ui/expedition-ui-kit-v1/icons/chip.svg',
  './shared-ui/expedition-ui-kit-v1/icons/compass.svg',
  './tutorial-story.js',
  './adventure-marks.js?v=74',
  './adventure-dialogue-presentation.js?v=77',
  './adventure-power.js?v=1',
  './adventure-runtime.js?v=76',
  './in-game-screen/game-objects/beacons/pressure-beacon-off.png',
  './in-game-screen/game-objects/beacons/pressure-beacon-on.png',
  './in-game-screen/game-objects/fake-wall/false-wall.png',
  './in-game-screen/game-objects/fake-wall/false-wall-v2.png',
  './in-game-screen/game-objects/fake-wall/false-wall-v3.png',
  './in-game-screen/game-objects/fake-wall/false-wall-v4.png',
  './in-game-screen/game-objects/fake-wall/false-wall-v5.png',
  './in-game-screen/game-objects/moving-walls/levitating-rail-a.png',
  './in-game-screen/game-objects/moving-walls/levitating-rail-b.png',
  './in-game-screen/game-objects/moving-walls/levitating-rail-c.png',
  './in-game-screen/game-objects/moving-walls/embedded-guide-rail.png',
  './in-game-screen/game-objects/moving-walls/framed-moving-barrier.png',
  './in-game-screen/game-objects/moving-walls/framed-moving-barrier-v2.png',
  './World_illustration/AAB-humanoid-bust-v3.png',
  './adventure-event-engine.js?v=72',
  './adventure-loadout.js',
  './adventure/stage-01.json',
  './adventure/stage-01-bundle.js',
  './효과음/화면과 진행/selection-general-clear.mp3',
  './효과음/화면과 진행/selection-important-clear.mp3',
  './효과음/cinematic_boom_sfx,__%231-1793588739342.mp3',
  './효과음/ElevenLabs_Drafts/hardening-crystal-gather-2s.mp3',
  './adventure/reward-icons/exploration-mark-a-wayfinder.png',
  './adventure/reward-icons/exploration-mark-a-wayfinder-broken.png',
  './adventure/reward-icons/exploration-mark-b-beacon.png',
  './adventure/reward-icons/exploration-mark-b-beacon-broken.png',
  './adventure/reward-icons/exploration-mark-c-route-seal.png',
  './in-game-screen/curling-table-maps/data-center/background-concept.png',
  './in-game-screen/curling-table-maps/classic/background-concept.png',
  './in-game-screen/curling-table-maps/ice/background-concept.png',
  './in-game-screen/curling-table-maps/moving-walls/background-concept.png',
  './in-game-screen/game-objects/data-center-ruins/broken-cooling-manifold.png',
  './in-game-screen/game-objects/data-center-ruins/collapsed-server-racks.png',
  './in-game-screen/game-objects/data-center-ruins/server-debris-and-cables.png',
  './in-game-screen/game-objects/data-center-ruins/shattered-ventilation-turbine.png',
  './ai-balance.js',
  './ai-policy.js',
  './ai-planner.js',
  './card-unlocks.js?v=1',
  './ai-planner-worker.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './stone-blue.png',
  './stone-red.png',
  ...['empty', 'pulse', 'blackhole', 'guard', 'hardening', 'reposition', 'repulsion']
    .flatMap(name => [`./Trigger_illustration/v6-organic/${name}.webp`, `./Trigger_illustration/v6-organic/${name}-sheet.webp`]),
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
  './Card_illustration/Repulsion Field.png',
  './Card_illustration/Dark Charge.png',
  './Card_illustration/refined/dark-charge.png',
  './Card_illustration/Haebang.png',
  './Card_illustration/refined/haebang.png',
  './Card_illustration/heavy-blow.png',
  './Card_illustration/refined/heavy-blow.png',
  './Card_illustration/reinforcements.png',
  './Card_illustration/refined/reinforcements.png',
  './Card_illustration/tracking.png',
  './Card_illustration/refined/tracking.png',
  './Card_illustration/neutralize.png',
  './Card_illustration/refined/neutralize.png',
  './in-game-screen/game-objects/neutralization-heartbeat.svg',
  './in-game-screen/game-objects/fixed-padlock.svg',
  './효과음/ElevenLabs_Drafts/release-charge-2s.mp3',
  './효과음/ElevenLabs_Drafts/release-fire-2s.mp3',
  './효과음/ElevenLabs_Drafts/heavy-blow-charge-2s.mp3',
  './효과음/ElevenLabs_Drafts/heavy-blow-release-2s.mp3',
  './효과음/ElevenLabs_Drafts/reinforcements-land-2s.mp3',
  './효과음/ElevenLabs_Drafts/tracking-lock-2s.mp3',
  './효과음/ElevenLabs_Drafts/neutralize-arm-v2-2s.mp3',
  './효과음/ElevenLabs_Drafts/fixed-lock-2s.mp3',
  './영웅 초상화/trap master.png',
  './영웅 초상화/hunter.png',
  './영웅 초상화/big boy.png',
  './영웅 초상화/joker.png',
  './효과음/충돌과 타이머/Midhit_1.wav',
  './효과음/Unit_death_sound_for_1.wav',
  './효과음/Unit_kill_sound_1.wav',
  './효과음/카드와 트리거/shockwave_sound_1.wav',
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
  './효과음/ElevenLabs_Drafts/hardening-freeze-v3.mp3',
  './효과음/ElevenLabs_Drafts/guard-orbit-v2.mp3',
  './효과음/ElevenLabs_Drafts/pulse-release.mp3',
  './효과음/ElevenLabs_Drafts/pulse-charge-v1.mp3',
  './효과음/ElevenLabs_Drafts/reposition-gear-v2.mp3',
  './효과음/ElevenLabs_Drafts/structure-drop-iron-v2.mp3',
  './효과음/ElevenLabs_Drafts/blackhole-release-v3.mp3',
  './효과음/ElevenLabs_Drafts/ammo-load.mp3',
  './효과음/ElevenLabs_Drafts/bluffing-sand-v2.mp3',
  './효과음/ElevenLabs_Drafts/escape-teleport-v2.mp3',
  './효과음/ElevenLabs_Drafts/repulsion-field-v2-mastered.mp3',
  './효과음/ElevenLabs_Drafts/repulsion-collision-v1-mastered.mp3',
  './효과음/ElevenLabs_Drafts/trigger-place-v1.mp3',
  './효과음/ElevenLabs_Drafts/data-barrier-form-v1.mp3',
  './효과음/ElevenLabs_Drafts/strong-impact-v3.mp3',
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
  if (new URL(event.request.url).pathname === '/adventure/stage-01.json') {
    event.respondWith(fetch(event.request, { cache: 'no-store' }).catch(() => caches.match('./adventure/stage-01.json')));
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
