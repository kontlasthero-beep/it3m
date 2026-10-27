const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../adventure-editor-model');
const loadout = require('../adventure-loadout');

test('editor board uses the same canvas and fall boundary as the game', () => {
  assert.deepEqual(editor.BOARD, { width: 1200, height: 772 });
  assert.deepEqual(editor.TABLE, { left: 88, right: 1112, top: 68, bottom: 662 });
  assert.equal(editor.isWithinPlayArea(88, 68), true);
  assert.equal(editor.isWithinPlayArea(87, 68), false);
  assert.deepEqual(editor.pointOnBoard(-20, 900), { x: 0, y: 772 });
});

test('each stage keeps adjustable fall bounds without changing the default game table', () => {
  const stage = editor.createStage('custom-boundary');
  assert.deepEqual(stage.fallBounds, editor.TABLE);
  stage.fallBounds = editor.resizeFallBounds(stage.fallBounds, { x: -1, y: -1 }, { x: 75, y: 110 });
  stage.fallBounds = editor.resizeFallBounds(stage.fallBounds, { x: 1, y: 1 }, { x: 1130, y: 680 });
  assert.deepEqual(stage.fallBounds, { left: 75, right: 1130, top: 110, bottom: 680 });
  assert.equal(editor.isWithinPlayArea(90, 100, 0, stage.fallBounds), false);
  assert.equal(editor.isWithinPlayArea(90, 100), true);
  assert.deepEqual(editor.normalizeStage(JSON.parse(JSON.stringify(stage))).fallBounds, stage.fallBounds);
  delete stage.fallBounds;
  assert.deepEqual(editor.normalizeStage(stage).fallBounds, editor.TABLE);
});

test('fall bounds keep opposite edges fixed and enforce a minimum playable area', () => {
  const changed = editor.resizeFallBounds(editor.TABLE, { x: -1, y: 0 }, { x: 2000 }, false);
  assert.deepEqual(changed, { left: 1032, right: 1112, top: 68, bottom: 662 });
  const snapped = editor.resizeFallBounds(editor.TABLE, { x: 0, y: 1 }, { y: 637 }, true);
  assert.deepEqual(snapped, { left: 88, right: 1112, top: 68, bottom: 640 });
  assert.deepEqual(editor.normalizeFallBounds({ left: -20, right: 9999, top: -10, bottom: 9999 }),
    { left: 0, right: 1200, top: 0, bottom: 772 });
});

test('stage export preserves layout, mechanic notes, dialogue and uploaded assets', () => {
  const stage = editor.createStage('stage-test');
  stage.title = '데이터센터의 문턱';
  stage.objective = { type: 'reach-zone', target: 'zone-1', turnLimit: 2, notes: '상대 충돌 이후만 성공' };
  stage.assets.push({ id: 'upload:concept', name: 'concept.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AA==' });
  stage.backgroundAssetId = 'upload:concept';
  stage.objects.push({ id: 'zone-1', assetId: 'builtin:zone', kind: 'zone', owner: 'neutral', x: 400, y: 250,
    width: 130, height: 90, rotation: 15, label: '도착 구역', notes: '희미하게 빛남', mechanicNotes: '충돌 뒤 진입해야 유효' });
  stage.dialogue.push({ id: 'line-1', cue: 'intro', speaker: '빅보이', portraitAssetId: 'builtin:portrait-big boy.png', voiceAssetId: '', text: '앞으로 가자.' });
  const roundTrip = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.equal(roundTrip.backgroundAssetId, 'upload:concept');
  assert.equal(roundTrip.objects[0].mechanicNotes, '충돌 뒤 진입해야 유효');
  assert.equal(roundTrip.dialogue[0].speaker, '빅보이');
  assert.equal(roundTrip.dialogue[0].priority, 1);
  assert.equal(roundTrip.assets[0].dataUrl, 'data:image/png;base64,AA==');
  assert.equal(roundTrip.assets[0].category, 'map');
});

test('uploaded categories, groups, and flips survive export while legacy assets remain usable', () => {
  const stage = editor.createStage('grouped-stage');
  stage.assets.push({ id: 'upload:stone', name: 'stone.png', mime: 'image/png',
    dataUrl: 'data:image/png;base64,AA==', category: 'stone' });
  stage.assets.push({ id: 'upload:audio', name: 'cue.mp3', mime: 'audio/mpeg',
    dataUrl: 'data:audio/mpeg;base64,AA==' });
  stage.objects.push({ id: 'one', assetId: 'upload:stone', kind: 'stone', owner: 'player',
    x: 210, y: 190, width: 50, height: 50, rotation: 32, flipX: true, flipY: false,
    groupId: 'group:sample', label: 'one' });
  stage.objects.push({ id: 'two', assetId: 'builtin:brick', kind: 'structure', owner: 'neutral',
    x: 280, y: 190, width: 20, height: 60, rotation: 0, flipY: true, groupId: 'group:sample' });
  const restored = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.deepEqual(restored.assets.map(asset => asset.category), ['stone', 'audio']);
  assert.deepEqual(restored.objects.map(object => [object.groupId, object.flipX, object.flipY]),
    [['group:sample', true, false], ['group:sample', false, true]]);
  delete stage.assets[0].category;
  delete stage.objects[0].groupId;
  delete stage.objects[0].flipX;
  const legacy = editor.normalizeStage(stage);
  assert.equal(legacy.assets[0].category, 'decoration');
  assert.equal(legacy.objects[0].groupId, '');
  assert.equal(legacy.objects[0].flipX, false);
});

test('wire route and beacon activation controls survive stage JSON round trip', () => {
  const stage = editor.createStage('power-stage');
  stage.objects.push({ id: 'beacon', assetId: 'builtin:pressure-beacon-off', kind: 'decoration',
    owner: 'neutral', x: 200, y: 200, width: 86, height: 86, rotation: 0,
    runtime: { powerInitialActive: false, powerLogic: 'all', conditionStone: true,
      conditionPulse: true, powerPortMode: 'both' } });
  stage.objects.push({ id: 'wire', assetId: 'builtin:floor-wire-off-concept', kind: 'decoration',
    owner: 'neutral', x: 250, y: 220, width: 100, height: 40, rotation: 0,
    runtime: { routePoints: [200, 200, 240, 200, 240, 240, 300, 240], wirePortMode: 'output' } });
  const saved = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.deepEqual(saved.objects[0].runtime, stage.objects[0].runtime);
  assert.deepEqual(saved.objects[1].runtime, stage.objects[1].runtime);
});

test('starting hand and bag preserve independent modes, duplicates and order through export', () => {
  const stage = editor.createStage('loadout-test');
  stage.loadout.startingHand = { mode: 'random', drawCount: 2, cards: ['ammo', 'guard', 'ammo'] };
  stage.loadout.deck = { mode: 'ordered', cards: ['pulse', 'brick', 'escape'] };
  const restored = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.deepEqual(restored.loadout.startingHand, stage.loadout.startingHand);
  assert.deepEqual(restored.loadout.deck, { mode: 'ordered', cards: ['pulse', 'brick', 'escape', 'ammo', 'guard', 'ammo'] });
  assert.deepEqual(loadout.resolveLoadout(restored.loadout, () => 0),
    { startingHand: ['guard', 'ammo'], deck: ['pulse', 'brick', 'escape', 'ammo'] });
  assert.deepEqual(stage.loadout.startingHand.cards, ['ammo', 'guard', 'ammo']);
  assert.deepEqual(stage.loadout.deck.cards, ['pulse', 'brick', 'escape']);
});

test('bag can shuffle independently and old stages retain their starting card', () => {
  const stage = editor.createStage('bag-test');
  stage.loadout.startingHand = { mode: 'ordered', drawCount: 2, cards: ['guard', 'ammo', 'pulse'] };
  stage.loadout.deck = { mode: 'random', cards: ['brick', 'escape', 'bluffing'] };
  assert.deepEqual(loadout.resolveLoadout(stage.loadout, () => 0),
    { startingHand: ['guard', 'ammo'], deck: ['escape', 'bluffing', 'pulse', 'brick'] });
  delete stage.loadout;
  const legacy = editor.normalizeStage(stage).loadout;
  assert.deepEqual(legacy.startingHand,
    { mode: 'ordered', drawCount: 1, cards: ['reposition'] });
  assert.deepEqual(legacy.deck.cards, ['reposition']);
  assert.deepEqual(loadout.resolveLoadout(legacy), { startingHand: ['reposition'], deck: [] });
});

test('unselected starting-hand candidates stay in the bag and selected copies leave it once', () => {
  const config = { startingHand: { mode: 'ordered', drawCount: 1, cards: ['ammo', 'ammo', 'guard'] },
    deck: { mode: 'ordered', cards: ['guard', 'ammo', 'brick', 'ammo'] } };
  assert.deepEqual(loadout.resolveLoadout(config),
    { startingHand: ['ammo'], deck: ['guard', 'brick', 'ammo'] });
});

test('invalid stage card IDs and draw counts are rejected', () => {
  const stage = editor.createStage('bad-loadout');
  stage.loadout.deck.cards.push('unknown');
  assert.throws(() => editor.normalizeStage(stage), /deck 카드/);
  stage.loadout.deck.cards = [];
  stage.loadout.startingHand.drawCount = 1;
  assert.throws(() => editor.normalizeStage(stage), /손패 장수/);
});

test('legacy dialogue keeps insertion order and new dialogue follows it', () => {
  const stage = editor.createStage('dialogue-order');
  stage.dialogue = [
    { id: 'first', cue: 'intro', text: '먼저' },
    { id: 'second', cue: 'intro', text: '다음' },
    { id: 'other', cue: 'event', text: '이벤트' }
  ];
  const restored = editor.normalizeStage(stage);
  assert.deepEqual(restored.dialogue.map(line => [line.id, line.priority]),
    [['first', 1], ['second', 2], ['other', 3]]);
  restored.dialogue.push({ id: 'new', cue: 'intro', priority: 4, text: '마지막' });
  assert.deepEqual(editor.dialogueForCue(restored, 'intro').map(line => line.id), ['first', 'second', 'new']);
});

test('reordering dialogue renumbers priorities and cue playback follows that order', () => {
  const stage = editor.createStage('dialogue-reorder');
  stage.dialogue = [
    { id: 'first', cue: 'intro', priority: 1, text: '첫째' },
    { id: 'second', cue: 'event', priority: 2, text: '다른 상황' },
    { id: 'third', cue: 'intro', priority: 3, text: '셋째' }
  ];
  stage.dialogue = editor.moveDialogue(stage.dialogue, 2, 0);
  assert.deepEqual(stage.dialogue.map(line => [line.id, line.priority]),
    [['third', 1], ['first', 2], ['second', 3]]);
  assert.deepEqual(editor.dialogueForCue(stage, 'intro').map(line => line.text), ['셋째', '첫째']);
  assert.deepEqual(editor.dialogueForCue(stage, 'event').map(line => line.id), ['second']);
  assert.deepEqual(editor.dialogueForCue(stage, 'success'), []);
  const roundTrip = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.deepEqual(roundTrip.dialogue.map(line => line.id), ['third', 'first', 'second']);
});

test('imported explicit priorities sort stably and empty dialogue is not played', () => {
  const stage = editor.createStage('dialogue-import');
  stage.dialogue = [
    { id: 'late', cue: 'intro', priority: 8, text: '나중' },
    { id: 'early', cue: 'intro', priority: 2, text: '먼저' },
    { id: 'blank', cue: 'intro', priority: 2, text: '   ' }
  ];
  const imported = editor.normalizeStage(stage);
  assert.deepEqual(imported.dialogue.map(line => [line.id, line.priority]),
    [['early', 1], ['blank', 2], ['late', 3]]);
  assert.deepEqual(editor.dialogueForCue(imported, 'intro').map(line => line.id), ['early', 'late']);
});

test('invalid stage files and unsupported embedded media are rejected', () => {
  assert.throws(() => editor.normalizeStage({}), /지원하지 않는/);
  const stage = editor.createStage('stage-invalid');
  stage.assets.push({ id: 'upload:bad', name: 'bad.svg', mime: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,AA==' });
  assert.throws(() => editor.normalizeStage(stage), /에셋의 형식/);
});

test('corner handles preserve the original aspect ratio and opposite corner', () => {
  const plain = { x: 100, y: 100, width: 40, height: 20, rotation: 0 };
  assert.deepEqual(editor.resizeFromHandle(plain, { x: 1, y: 1 }, { x: 150, y: 130 }),
    { x: 116, y: 108, width: 72, height: 36 });
  const rotated = { x: 100, y: 100, width: 40, height: 20, rotation: 90 };
  assert.deepEqual(editor.resizeFromHandle(rotated, { x: 1, y: 1 }, { x: 80, y: 140 }),
    { x: 95, y: 110, width: 60, height: 30 });
});

test('side handles resize only one axis, including rotated objects', () => {
  const object = { x: 100, y: 100, width: 40, height: 20, rotation: 0 };
  assert.deepEqual(editor.resizeFromHandle(object, { x: 1, y: 0 }, { x: 150, y: 130 }),
    { x: 115, y: 100, width: 70, height: 20 });
  assert.deepEqual(editor.resizeFromHandle(object, { x: 0, y: 1 }, { x: 120, y: 130 }),
    { x: 100, y: 110, width: 40, height: 40 });
  const rotated = { ...object, rotation: 90 };
  assert.deepEqual(editor.resizeFromHandle(rotated, { x: 1, y: 0 }, { x: 100, y: 140 }),
    { x: 100, y: 110, width: 60, height: 20 });
});

test('resize clamps dimensions and snaps without breaking corner proportions', () => {
  const object = { x: 100, y: 100, width: 40, height: 20, rotation: 0 };
  assert.deepEqual(editor.resizeFromHandle(object, { x: 1, y: 1 }, { x: 121, y: 111 }, true),
    { x: 100, y: 100, width: 40, height: 20 });
  const tiny = editor.resizeFromHandle(object, { x: 1, y: 1 }, { x: 60, y: 90 });
  assert.equal(tiny.width, 8);
  assert.equal(tiny.height, 4);
  assert.equal(tiny.width / tiny.height, object.width / object.height);
});

test('dialogue line breaks and presentation settings survive export and import', () => {
  const stage = editor.createStage('dialogue-style');
  stage.dialogue.push({ id: 'line-1', cue: 'success', priority: 1, speaker: '빅보이',
    portraitAssetId: '', voiceAssetId: '', text: '첫 줄\n둘째 줄', presentation: {
      font: 'serif', fontSize: 22, reveal: 'typewriter', speed: 28,
      typingSoundAssetId: 'upload:tick', direction: '둘째 줄 앞에서 잠깐 멈춘다'
    } });
  const restored = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.equal(restored.dialogue[0].text, '첫 줄\n둘째 줄');
  assert.deepEqual(restored.dialogue[0].presentation, stage.dialogue[0].presentation);
});
