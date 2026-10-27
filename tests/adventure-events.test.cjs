const test = require('node:test');
const assert = require('node:assert/strict');
const editor = require('../adventure-editor-model');
const engine = require('../adventure-event-engine');
const runtime = require('../adventure-runtime');
const catalog = require('../adventure-event-catalog');

test('editor events and variables survive stage export without changing old stages', () => {
  const stage = editor.createStage('events');
  stage.variables = [{ id: 'power', name: '전력', type: 'number', initial: 2 }];
  stage.events = [{ id: 'collected', name: '전력 증가', enabled: true, priority: 1, once: true,
    trigger: { type: 'trigger-collected', objectId: 'trigger-1' }, conditionMode: 'all',
    conditions: [{ variableId: 'power', operator: 'gte', value: 2 }],
    actions: [{ type: 'add-variable', variableId: 'power', amount: 3 }, { type: 'show-object', objectId: 'gate-1' }] }];
  stage.objects.push({ id: 'gate-1', assetId: 'builtin:dummy-structure', kind: 'structure', owner: 'neutral',
    x: 400, y: 300, width: 50, height: 50, visible: false });
  const restored = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.equal(restored.variables[0].initial, 2);
  assert.equal(restored.events[0].actions[0].amount, 3);
  assert.equal(restored.objects[0].visible, false);
  assert.deepEqual(editor.normalizeStage(editor.createStage('old')).events, []);
});

test('event engine applies ordered conditional actions and emits variable changes once', () => {
  const stage = editor.createStage('sequence');
  stage.variables = [{ id: 'power', type: 'number', initial: 2 }];
  stage.objects = [{ id: 'gate', visible: false }];
  stage.events = [
    { id: 'collect', priority: 2, once: true, enabled: true, trigger: { type: 'trigger-collected', objectId: 'orb' },
      conditions: [], actions: [{ type: 'add-variable', variableId: 'power', amount: 2 }] },
    { id: 'reveal', priority: 1, once: true, enabled: true, trigger: { type: 'variable-changed', variableId: 'power' },
      conditions: [{ variableId: 'power', operator: 'gte', value: 4 }],
      actions: [{ type: 'show-object', objectId: 'gate' }, { type: 'screen-shake', intensity: .2, duration: .3 }] }
  ];
  const state = engine.createState(stage);
  assert.deepEqual(engine.dispatch(stage, state, { type: 'trigger-collected', objectId: 'other' }), []);
  assert.deepEqual(engine.dispatch(stage, state, { type: 'trigger-collected', objectId: 'orb' }).map(effect => effect.type),
    ['add-variable', 'show-object', 'screen-shake']);
  assert.equal(state.variables.power, 4);
  assert.equal(state.visibleObjects.get('gate'), true);
  assert.deepEqual(engine.dispatch(stage, state, { type: 'trigger-collected', objectId: 'orb' }), []);
});

test('unknown events are rejected rather than becoming stage-start dialogue', () => {
  const stage = editor.createStage('invalid');
  stage.events = [{ id: 'future', trigger: { type: 'unsupported-future' }, actions: [] }];
  assert.throws(() => editor.normalizeStage(stage), /지원하지 않는 연출 발생 조건/);
  stage.events[0].trigger.type = 'stage-start';
  stage.events[0].actions = [{ type: 'unsupported-future' }];
  assert.throws(() => editor.normalizeStage(stage), /지원하지 않는 연출 동작/);
});

test('object mechanic settings survive editor export and feed gameplay runtime', () => {
  const stage = editor.createStage('mechanics');
  stage.backgroundAssetId = 'map';
  stage.assets = [{ id: 'map', dataUrl: 'data:image/png;base64,AA==', category: 'map' },
    { id: 'art', dataUrl: 'data:image/png;base64,AA==', category: 'decoration' }];
  stage.objective = { type: 'reach-zone', turnLimit: 1 };
  stage.objects = [
    { id: 'start', assetId: 'builtin:note', kind: 'note', owner: 'player', x: 100, y: 300, width: 10, height: 10 },
    { id: 'goal', assetId: 'builtin:zone', kind: 'zone', owner: 'neutral', x: 600, y: 300, width: 100, height: 100 },
    { id: 'dummy', assetId: 'builtin:dummy-stone', kind: 'stone', owner: 'neutral', x: 400, y: 300,
      width: 58, height: 58, runtime: { pulseRadius: 140, pulseImpulseMultiplier: 2.2 } },
    { id: 'trigger', assetId: 'builtin:dummy-trigger', kind: 'trigger', owner: 'neutral', x: 450, y: 300,
      width: 58, height: 58, runtime: { mechanicId: 'reposition-trigger', frictionMultiplier: 2,
        eventDialogueIds: ['line-1'], dialogueWhen: 'resting', revealFog: true } },
    { id: 'decoration', assetId: 'art', kind: 'decoration', owner: 'neutral', x: 500, y: 300,
      width: 120, height: 90, visible: false }
  ];
  const saved = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.equal(saved.objects[2].runtime.pulseRadius, 140);
  assert.deepEqual(saved.objects[3].runtime.eventDialogueIds, ['line-1']);
  const playable = runtime.prepareStage(saved);
  assert.equal(playable.dummies[0].pulseImpulseMultiplier, 2.2);
  assert.equal(playable.triggers[0].frictionMultiplier, 2);
  assert.equal(playable.triggers[0].revealFog, true);
  assert.equal(playable.props[0].collidable, false);
  assert.ok(catalog.mechanics.find(entry => entry.assetId === 'builtin:dummy-stone'));
});
