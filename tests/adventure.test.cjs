const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const adventure = require('../adventure-runtime');
const loadout = require('../adventure-loadout');

const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../adventure/stage-01.json'), 'utf8'));
const stage = adventure.prepareStage(source);

test('editor stage preserves the data-center layout and mechanics', () => {
  assert.equal(stage.mapId, 'classic');
  assert.equal(stage.title, '데이터 속으로');
  assert.equal(stage.barriers.length, 0);
  assert.equal(stage.props.length, 28);
  assert.equal(stage.triggers.length, 2);
  assert.deepEqual(stage.triggers.map(trigger => trigger.radius), [39.64, 39.835]);
  assert.ok(stage.triggers.every(trigger => trigger.frictionMultiplier === 2 && trigger.frictionSeconds === 1.5));
  assert.deepEqual(stage.triggers.map(trigger => trigger.eventDialogueIds.length), [1, 2]);
  assert.deepEqual(stage.triggers.map(trigger => trigger.revealFog), [false, true]);
  assert.equal(stage.dummies.length, 3);
  assert.deepEqual(stage.start, { x: 1106, y: 494 });
  assert.deepEqual(stage.fallBounds, { left: 62, right: 1132, top: 73, bottom: 662 });
  assert.equal(stage.fog.width, 460);
  assert.equal(stage.stoneScale, 0.7);
  assert.ok(stage.dummies.every(dummy => dummy.radius === 29 && dummy.pulseImpulseMultiplier === 1.5 &&
    dummy.ricochetRestitution === 1 &&
    dummy.velocityMultiplierOnHit === .5 && dummy.frictionMultiplierOnHit === .5));
  assert.equal(stage.props.find(prop => prop.id === '3e69db8d-2761-41d7-92ff-85f9cd221240').flipX, true);
  assert.equal(stage.props.find(prop => prop.id === '4cafa0a8-bceb-47c1-8401-37bda22c430f').flipX, true);
  assert.ok(fs.existsSync(path.join(__dirname, '..', stage.backgroundSrc)));
  assert.ok(stage.props.every(prop => fs.existsSync(path.join(__dirname, '..', prop.src))));
  assert.deepEqual(stage.goal, { id: source.objects.find(object => object.kind === 'zone').id,
    x: 235.5, y: 595, width: 187, height: 95, rotation: 0 });
});

test('stage begins without cards but accepts editor-defined hand and bag', () => {
  assert.deepEqual(stage.loadout.startingHand, { mode: 'ordered', drawCount: 0, cards: [] });
  const custom = adventure.prepareStage({ ...source, loadout: {
    startingHand: { mode: 'ordered', drawCount: 2, cards: ['ammo', 'guard', 'pulse'] },
    deck: { mode: 'random', cards: ['brick', 'blackhole', 'escape'] }
  } });
  assert.deepEqual(loadout.resolveLoadout(custom.loadout, () => 0),
    { startingHand: ['ammo', 'guard'], deck: ['blackhole', 'escape', 'pulse', 'brick'] });
});

test('placed beacon, routed wire and powered structure become playable stage objects', () => {
  const custom = adventure.prepareStage({ ...source,
    assets: [...source.assets, { id: 'upload:gate-art', name: 'gate.png', mime: 'image/png',
      category: 'structure', dataUrl: 'data:image/png;base64,AA==' }],
    objects: [...source.objects,
      { id: 'beacon-a', assetId: 'builtin:pressure-beacon-off', kind: 'decoration', owner: 'neutral',
        x: 210, y: 210, width: 86, height: 86, rotation: 0,
        runtime: { conditionStone: true, conditionPowered: true, powerLogic: 'any', powerPortMode: 'output' } },
      { id: 'wire-a', assetId: 'builtin:floor-wire-off-concept', kind: 'decoration', owner: 'neutral',
        x: 330, y: 210, width: 140, height: 46, rotation: 0,
        runtime: { routePoints: [210, 210, 270, 210, 270, 270, 390, 270], wirePortMode: 'both' } },
      { id: 'gate-a', assetId: 'upload:gate-art', kind: 'structure', owner: 'neutral',
        x: 390, y: 270, width: 70, height: 70, rotation: 0,
        runtime: { powerReactive: true, powerPortMode: 'input' } }
    ] });
  assert.deepEqual(custom.beacons[0].conditions, ['powered', 'stone']);
  assert.equal(custom.beacons[0].logic, 'any');
  assert.equal(custom.beacons[0].width, 86);
  assert.deepEqual(custom.wires[0].points,
    [{ x: 210, y: 210 }, { x: 270, y: 210 }, { x: 270, y: 270 }, { x: 390, y: 270 }]);
  assert.equal(custom.powerDevices[0].id, 'gate-a');
  const result = require('../adventure-power').evaluatePowerNetwork({
    beacons: custom.beacons, wires: custom.wires, devices: custom.powerDevices,
    stones: [{ x: 210, y: 210, radius: 20 }]
  });
  assert.equal(result.activeById.get('beacon-a'), true);
  assert.equal(result.poweredById.get('gate-a'), true);
});

test('one stone clears on arrival and can wait with a reposition card or active reaim', () => {
  const unit = { x: 1060, y: 365, status: 'ready', hasLaunched: false };
  const outcome = options => adventure.stageOutcome({ unit, goal: stage.goal, hasReposition: false,
    reaiming: false, ...options });
  assert.equal(outcome(), null);
  unit.hasLaunched = true;
  unit.status = 'sliding';
  unit.x = stage.goal.x;
  unit.y = stage.goal.y;
  assert.equal(outcome(), 'success');
  unit.status = 'fallen';
  assert.equal(outcome(), 'failure');
  unit.status = 'resting';
  unit.x = 500;
  assert.equal(outcome(), null);
  assert.equal(outcome({ restSeconds: 2.9 }), null);
  assert.equal(outcome({ restSeconds: 3 }), 'failure');
  assert.equal(outcome({ hasReposition: true, restSeconds: 2.9 }), null);
  assert.equal(outcome({ hasReposition: true, restSeconds: 30 }), null);
  assert.equal(outcome({ reaiming: true }), null);
});

test('invalid stage types and unimplemented objects are rejected rather than silently skipped', () => {
  assert.throws(() => adventure.prepareStage({ ...source, version: 2 }));
  assert.throws(() => adventure.prepareStage({ ...source, objects: [...source.objects,
    { id: 'unknown', kind: 'stone', assetId: 'builtin:stone', x: 300, y: 300, width: 58, height: 58, rotation: 0 }] }));
  assert.equal(adventure.dialogueFor(stage, 'intro').length, 3);
  assert.equal(adventure.dialogueFor(stage, 'event').length, 3);
  assert.match(adventure.dialogueFor(stage, 'success')[0].text, /어찌저찌 해냈군/);
});
