const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const marks = require('../adventure-marks');
const editor = require('../adventure-editor-model');
const adventure = require('../adventure-runtime');

test('B beacon is the default and legacy stages acquire one mark on clear', () => {
  assert.equal(marks.DEFAULT_ICON_SET, 'beacon');
  assert.match(marks.ICON_SETS.beacon.earnedSrc, /exploration-mark-b-beacon\.png$/);
  assert.match(marks.ICON_SETS.beacon.unearnedSrc, /exploration-mark-b-beacon-broken\.png$/);
  assert.deepEqual(marks.createConfig(), { iconSet: 'beacon', bonus: [] });
  assert.equal(marks.evaluate(null, { cleared: true }).count, 1);
  assert.equal(marks.evaluate(null, { cleared: false }).count, 0);
});

test('each configured bonus earns one additional mark, capped at three', () => {
  const config = marks.normalizeConfig({ iconSet: 'beacon', bonus: [
    { type: 'hand-card', cardId: 'reposition' }, { type: 'trigger-count', count: 2 },
    { type: 'trigger-count', count: 1 }
  ] });
  assert.equal(config.bonus.length, 2);
  assert.equal(marks.evaluate(config, { cleared: true }).count, 1);
  assert.equal(marks.evaluate(config, { cleared: true, handCardIds: ['reposition'] }).count, 2);
  assert.equal(marks.evaluate(config, { cleared: true, handCardIds: ['reposition'],
    collectedTriggerIds: ['one', 'two'] }).count, 3);
  assert.equal(marks.evaluate(config, { cleared: false, handCardIds: ['reposition'],
    collectedTriggerIds: ['one', 'two'] }).count, 0);
  assert.equal(marks.evaluate({ iconSet: 'unknown', bonus: [{ type: 'invalid' }] }, { cleared: true }).iconSet, 'beacon');
});

test('editor JSON round trip and stage 01 runtime preserve mark conditions', () => {
  const stage = editor.createStage('marks');
  stage.explorationMarks = { iconSet: 'wayfinder', bonus: [{ type: 'hand-card', cardId: 'reposition' }] };
  assert.deepEqual(editor.normalizeStage(JSON.parse(JSON.stringify(stage))).explorationMarks, stage.explorationMarks);
  const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../adventure/stage-01.json'), 'utf8'));
  const playable = adventure.prepareStage(source);
  assert.deepEqual(playable.explorationMarks, { iconSet: 'beacon', bonus: [
    { type: 'hand-card', cardId: 'reposition' }, { type: 'trigger-count', count: 2 }
  ] });
});

test('a written bonus condition follows a stage event variable at clear time', () => {
  const config = { iconSet: 'beacon', bonus: [{ type: 'variable', description: '카드 사용 없이 클리어',
    variableId: 'no-card', operator: 'eq', value: 'true' }] };
  const stage = editor.createStage('custom-mark');
  stage.variables = [{ id: 'no-card', name: '카드 미사용', type: 'boolean', initial: false }];
  stage.explorationMarks = config;
  const restored = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.deepEqual(restored.explorationMarks, config);
  const context = { cleared: true, variableDefinitions: stage.variables, variableValues: { 'no-card': false } };
  assert.equal(marks.evaluate(config, context).count, 1);
  context.variableValues['no-card'] = true;
  assert.equal(marks.evaluate(config, context).count, 2);
  assert.equal(marks.evaluate(config, { ...context, cleared: false }).count, 0);
  assert.equal(marks.evaluate(config, { cleared: true }).count, 1);
});

test('packaged exploration art stays a generic editor image through export', () => {
  assert.equal(marks.EDITOR_ASSETS.length, 5);
  const stage = editor.createStage('art');
  const asset = marks.EDITOR_ASSETS[2];
  stage.assets.push({ id: `upload:bundled:${asset.file.replace(/\.png$/, '')}`, name: asset.name,
    mime: 'image/png', category: 'decoration', src: asset.src });
  stage.backgroundAssetId = stage.assets[0].id;
  stage.objects.push({ id: 'mark-on-board', assetId: stage.assets[0].id, kind: 'decoration', owner: 'neutral',
    x: 300, y: 300, width: 90, height: 90 });
  stage.events = [{ id: 'show-mark', trigger: { type: 'stage-start' }, actions: [
    { type: 'illustration', assetId: stage.assets[0].id }
  ] }];
  const restored = editor.normalizeStage(JSON.parse(JSON.stringify(stage)));
  assert.equal(restored.assets[0].category, 'decoration');
  assert.equal(restored.assets[0].src, asset.src);
  assert.equal(restored.backgroundAssetId, stage.backgroundAssetId);
  assert.equal(restored.objects[0].assetId, stage.assets[0].id);
  assert.equal(restored.events[0].actions[0].assetId, stage.assets[0].id);
});
