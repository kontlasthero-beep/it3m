const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../ai-planner.js');

function board(map = 'classic') {
  return {
    actor: 1, turn: 1, launchId: 'ai', seed: 42,
    friction: map === 'ice' ? .00853875 : .020625,
    walls: map === 'moving-walls', mapTime: 0, koPoints: 25, points: [0, 0],
    units: [
      { id: 'enemy', owner: 0, x: 800, y: 355, vx: 0, vy: 0, radius: 29,
        status: 'resting', heroFriction: 1, powerScale: 1, pendingPulseTriggers: [] },
      { id: 'ai', owner: 1, x: 1060, y: 355, vx: 0, vy: 0, radius: 29,
        status: 'ready', heroFriction: 1, powerScale: 1, pendingPulseTriggers: [] }
    ], bricks: [], triggers: []
  };
}

test('rollouts resolve impacts, knockouts and final scoring without mutating the live snapshot', () => {
  const snapshot = board();
  const original = JSON.stringify(snapshot);
  const soft = planner.simulate(snapshot, { dx: -1, dy: 0, power: .25 });
  const hard = planner.simulate(snapshot, { dx: -1, dy: 0, power: 1 });
  assert.ok(soft.world.units[0].x < snapshot.units[0].x);
  assert.equal(hard.world.units[0].status, 'fallen');
  assert.equal(hard.world.points[1], 25);
  assert.equal(JSON.stringify(snapshot), original);
});

test('all difficulties produce legal, varied shots and greater search breadth', () => {
  const snapshot = board();
  const plans = ['easy', 'normal', 'hard'].map(level => planner.plan(snapshot, level));
  assert.ok(plans[0].evaluated < plans[1].evaluated);
  assert.ok(plans[1].evaluated < plans[2].evaluated);
  for (const plan of plans) {
    assert.ok(Number.isFinite(plan.score));
    assert.ok(plan.power >= .06 && plan.power <= 1);
    assert.ok(Math.abs(Math.hypot(plan.dx, plan.dy) - 1) < .0001);
    assert.ok(planner.simulate(snapshot, plan).scores[1] > 0);
  }
});

test('the planner includes the current map and consumable triggers', () => {
  const normal = board();
  const walled = board('moving-walls');
  const ice = board('ice');
  const shot = { dx: -1, dy: 0, power: .5 };
  assert.notEqual(planner.simulate(normal, shot).world.units[1].x,
    planner.simulate(walled, shot).world.units[1].x);
  assert.notEqual(planner.simulate(normal, shot).world.units[1].x,
    planner.simulate(ice, shot).world.units[1].x);
  normal.triggers.push({ x: 1000, y: 355, radius: 14.5, type: 'hardening' });
  const triggered = planner.simulate(normal, shot);
  assert.equal(triggered.world.triggers.length, 0);
  assert.equal(triggered.world.units[1].ability.stacks.hardening, 1);
});

test('counterplay risk increases when an exposed AI stone can be knocked out', () => {
  const snapshot = board();
  snapshot.units[0] = { ...snapshot.units[0], id: 'own', owner: 1, x: 140, y: 355 };
  snapshot.units[1].y = 500;
  const exposed = planner.replyRisk(snapshot, 1, 8);
  snapshot.units[0].x = 350;
  const sheltered = planner.replyRisk(snapshot, 1, 8);
  assert.ok(exposed > sheltered + 20);
  snapshot.units[0].x = 140;
  snapshot.replyKoPoints = 40;
  assert.ok(planner.replyRisk(snapshot, 1, 8) > exposed);
});

test('AAB counterplay models the opponent hand and defensive cards on earlier stones', () => {
  const snapshot = board();
  snapshot.units[0] = { ...snapshot.units[0], id: 'own', owner: 1, x: 140, y: 355 };
  snapshot.units[1].y = 500;
  snapshot.units.push({ id: 'human', owner: 0, x: 400, y: 355, vx: 0, vy: 0,
    radius: 29, status: 'resting', heroFriction: 1, powerScale: 1, pendingPulseTriggers: [] });
  assert.ok(planner.replyRisk(snapshot, 1, 8, ['blackhole'], true) >
    planner.replyRisk(snapshot, 1, 8, [], false) + 10);
  snapshot.hasReply = true;
  snapshot.enemyHand = [];
  const noCardPlan = planner.plan(snapshot, 'hard');
  snapshot.enemyHand = ['blackhole'];
  const knownCardPlan = planner.plan(snapshot, 'hard');
  assert.ok(knownCardPlan.score < noCardPlan.score);

  const defensible = board();
  defensible.units[0] = { ...defensible.units[0], id: 'own', owner: 1, x: 140, y: 355 };
  defensible.units[1].y = 500;
  defensible.turn = 3;
  defensible.seed = 4;
  defensible.hasReply = true;
  defensible.hand = ['guard', 'hardening'];
  const shot = { dx: -1, dy: 0, power: .8 };
  const guarded = planner.simulate(defensible, shot, 8,
    [{ card: 'guard', at: 0, targetId: 'own' }]);
  assert.equal(guarded.world.units[0].ability.stacks.guard, 1);
  const hardened = planner.cloneWorld(defensible);
  hardened.units[0].ability = { stacks: { hardening: 1 }, hardening: true };
  assert.ok(planner.replyRisk(hardened, 1, 8) < planner.replyRisk(defensible, 1, 8));
});

test('AAB can choose a two-card sequence around a collision', () => {
  const snapshot = board();
  snapshot.units[0].x = 250;
  snapshot.units[0].y = 280;
  snapshot.turn = 3;
  snapshot.seed = 4;
  snapshot.hasReply = true;
  snapshot.hand = ['blackhole', 'hardening', 'pulse', 'guard'];
  const plan = planner.plan(snapshot, 'hard');
  assert.equal(plan.tactics.length, 2);
  assert.equal(new Set(plan.tactics.map(tactic => tactic.card)).size, 2);
  assert.ok(plan.tactics.some(tactic => tactic.at > 0));
});

test('trigger placement weighs the follow-up shot and opponent counterplay', () => {
  const snapshot = board();
  snapshot.units[0] = { ...snapshot.units[0], id: 'own', owner: 1, x: 150, y: 355 };
  snapshot.units.splice(1, 0, { id: 'human', owner: 0, x: 650, y: 300, vx: 0, vy: 0,
    radius: 29, status: 'resting', heroFriction: 1, powerScale: 1, pendingPulseTriggers: [] });
  snapshot.turn = 3;
  snapshot.hasReply = true;
  snapshot.triggerCandidates = [{ x: 500, y: 355 }, { x: 600, y: 355 }];
  const plan = planner.plan(snapshot, 'easy');
  assert.equal(plan.trigger?.type, 'pulse');
  assert.equal(plan.trigger?.x, 600);
  assert.equal(snapshot.triggers.length, 0);
});
