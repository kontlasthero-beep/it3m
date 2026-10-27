const test = require('node:test');
const assert = require('node:assert/strict');
const power = require('../adventure-power');

const beacon = (id, x, conditions = [], extra = {}) =>
  ({ id, x, y: 0, radius: 8, conditions, ...extra });
const wire = (id, x0, x1, portMode = 'both') =>
  ({ id, points: [{ x: x0, y: 0 }, { x: x1, y: 0 }], portMode, collidable: false });
const device = (id, x, portMode = 'input') =>
  ({ id, x, y: 0, radius: 5, portMode });
const state = (result, id) => result.poweredById.get(id);

test('pressure plate turns on and off from circular stone overlap', () => {
  const input = { beacons: [beacon('plate', 0, ['stone'])],
    wires: [wire('lead', 0, 40)], devices: [device('lamp', 40)] };
  const off = power.evaluatePowerNetwork({ ...input, stones: [{ x: 30, y: 0, radius: 4 }] });
  assert.equal(off.activeById.get('plate'), false);
  assert.equal(state(off, 'lamp'), false);
  const on = power.evaluatePowerNetwork({ ...input, stones: [{ x: 12, y: 0, radius: 4 }] });
  assert.equal(on.activeById.get('plate'), true);
  assert.equal(state(on, 'lead'), true);
  assert.equal(state(on, 'lamp'), true);
  assert.equal(power.evaluatePowerNetwork(input).activeById.get('plate'), false);
});

test('all and any logic combine local and incoming conditions', () => {
  const input = { beacons: [beacon('source', 0, [], { initialActive: true }),
    beacon('all', 40, ['powered', 'stone']), beacon('any', 80, ['powered', 'stone'], { logic: 'any' })],
  wires: [wire('a', 0, 30), wire('b', 50, 80)] };
  const noStone = power.evaluatePowerNetwork(input);
  assert.equal(noStone.activeById.get('all'), false);
  assert.equal(state(noStone, 'all'), true); // Receives, but does not relay.
  assert.equal(noStone.activeById.get('any'), false);
  const withStone = power.evaluatePowerNetwork({ ...input, stones: [{ x: 40, y: 0, radius: 1 }] });
  assert.equal(withStone.activeById.get('all'), true);
  assert.equal(withStone.activeById.get('any'), true);
  assert.equal(state(withStone, 'b'), true);
});

test('zero-condition beacons follow initialActive, regardless of logic', () => {
  const result = power.evaluatePowerNetwork({ beacons: [
    beacon('on', 0, [], { initialActive: true, logic: 'any' }),
    beacon('off', 100, [], { initialActive: false })
  ] });
  assert.deepEqual([...result.activeById], [['on', true], ['off', false]]);
  assert.deepEqual([...result.poweredById], [['on', true], ['off', false]]);
});

test('input, output and both ports direct power; both wires and devices relay', () => {
  const base = { beacons: [beacon('source', 0, [], { initialActive: true })],
    devices: [device('target', 80)] };
  for (const mode of ['input', 'output']) {
    const result = power.evaluatePowerNetwork({ ...base, wires: [wire('first', 0, 30, mode), wire('second', 50, 80)] });
    assert.equal(state(result, 'target'), false, mode);
  }
  const throughWire = power.evaluatePowerNetwork({ ...base,
    wires: [wire('first', 0, 40), wire('second', 40, 80)] });
  assert.equal(state(throughWire, 'target'), true);
  const throughDevice = power.evaluatePowerNetwork({ ...base,
    wires: [wire('first', 0, 30), wire('second', 50, 80)],
    devices: [device('relay', 40, 'both'), device('target', 80)] });
  assert.equal(state(throughDevice, 'relay'), true);
  assert.equal(state(throughDevice, 'target'), true);
  const blockedDevice = power.evaluatePowerNetwork({ ...base,
    wires: [wire('first', 0, 30), wire('second', 50, 80, 'input')],
    devices: [device('relay', 40, 'input'), device('target', 80)] });
  assert.equal(state(blockedDevice, 'target'), false);
});

test('wire loops terminate, OR multiple sources, and powered-only cycles stay off', () => {
  const loop = { beacons: [beacon('a', 0, ['powered']), beacon('b', 100, ['powered'])],
    wires: [wire('ab', 0, 100),
      { id: 'ba', points: [{ x: 100, y: 0 }, { x: 150, y: 30 }, { x: 0, y: 0 }], portMode: 'both' }],
    devices: [device('lamp', 100)] };
  const dark = power.evaluatePowerNetwork(loop);
  assert.equal(dark.activeById.get('a'), false);
  assert.equal(dark.activeById.get('b'), false);
  assert.equal(state(dark, 'lamp'), false);
  const lit = power.evaluatePowerNetwork({ ...loop,
    beacons: [...loop.beacons, beacon('primary', 0, [], { initialActive: true })] });
  assert.equal(lit.activeById.get('a'), true);
  assert.equal(lit.activeById.get('b'), true);
  assert.equal(state(lit, 'lamp'), true);
  const secondSource = power.evaluatePowerNetwork({ ...loop,
    beacons: [...loop.beacons, beacon('primary', 0, [], { initialActive: false }),
      beacon('backup', 100, [], { initialActive: true })] });
  assert.equal(state(secondSource, 'lamp'), true);
});

test('structure overlap supports circular and rectangular bodies', () => {
  const input = { beacons: [beacon('sensor', 0, ['structure'])] };
  assert.equal(power.evaluatePowerNetwork(input).activeById.get('sensor'), false);
  assert.equal(power.evaluatePowerNetwork({ ...input,
    structures: [{ x: 12, y: 0, radius: 4 }] }).activeById.get('sensor'), true);
  assert.equal(power.evaluatePowerNetwork({ ...input,
    structures: [{ x: 12, y: 0, width: 8, height: 8 }] }).activeById.get('sensor'), true);
  assert.equal(power.evaluatePowerNetwork({ ...input,
    structures: [{ x: 30, y: 0, width: 8, height: 8 }] }).activeById.get('sensor'), false);
});

test('pulse latch is supplied by caller as Set or array and is not retained', () => {
  const input = { beacons: [beacon('pulse', 0, ['pulse'])] };
  assert.equal(power.evaluatePowerNetwork({ ...input, pulseHits: new Set(['pulse']) }).activeById.get('pulse'), true);
  assert.equal(power.evaluatePowerNetwork({ ...input, pulseHits: ['pulse'] }).activeById.get('pulse'), true);
  assert.equal(power.evaluatePowerNetwork(input).activeById.get('pulse'), false);
});

test('snapping uses endpoint proximity and can be configured', () => {
  const input = { beacons: [beacon('source', 0, [], { initialActive: true })],
    wires: [wire('lead', 11, 40), wire('next', 51, 80)], devices: [device('lamp', 91)] };
  assert.equal(state(power.evaluatePowerNetwork(input), 'lamp'), true);
  assert.equal(state(power.evaluatePowerNetwork({ ...input, snapDistance: 10 }), 'lamp'), false);
  assert.equal(power.circlesOverlap({ x: 0, y: 0, radius: 8 }, { x: 12, y: 0, radius: 4 }), true);
});
