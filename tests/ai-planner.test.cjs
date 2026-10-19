const test = require('node:test');
const assert = require('node:assert/strict');
const planner = require('../ai-planner.js');
const { SCENARIOS, summarizePlan } = require('../tools/ai-tactical-bench.cjs');

function board(map = 'classic') {
  return {
    actor: 1, turn: 1, launchId: 'ai', seed: 42,
    friction: map === 'ice' ? .0165 : .020625,
    walls: map === 'moving-walls', mapTime: 0, koPoints: 25, points: [0, 0],
    units: [
      { id: 'enemy', owner: 0, x: 800, y: 365, vx: 0, vy: 0, radius: 29,
        status: 'resting', heroFriction: 1, powerScale: 1, pendingPulseTriggers: [] },
      { id: 'ai', owner: 1, x: 1060, y: 365, vx: 0, vy: 0, radius: 29,
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

test('AI rollouts use the visible table edge as the stone fall boundary', () => {
  const snapshot = board();
  snapshot.units[1].x = 89;
  const result = planner.simulate(snapshot, { dx: -1, dy: 0, power: 1 });
  assert.equal(result.world.units[1].status, 'fallen');
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
  normal.triggers.push({ x: 1000, y: 365, radius: 14.5, type: 'hardening' });
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
  snapshot.units[0] = { ...snapshot.units[0], id: 'own', owner: 1, x: 140, y: 365 };
  snapshot.units[1].y = 510;
  snapshot.units.push({ id: 'human', owner: 0, x: 400, y: 365, vx: 0, vy: 0,
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

test('AAB searches deeper card lines around collisions without forcing a weaker combo', () => {
  const snapshot = board();
  snapshot.units[0].x = 250;
  snapshot.units[0].y = 280;
  snapshot.turn = 3;
  snapshot.seed = 4;
  snapshot.hasReply = true;
  snapshot.hand = ['blackhole', 'hardening', 'pulse', 'guard'];
  const plan = planner.plan(snapshot, 'hard');
  assert.equal(plan.searchDepth, 6);
  assert.ok(Number.isFinite(plan.futureValue));
  assert.ok(plan.tactics.length <= 4);
  assert.equal(new Set(plan.tactics.map(tactic => tactic.card)).size, plan.tactics.length);
});

test('AAB evaluates two later own stones while Neutron uses a shallower horizon', () => {
  const snapshot = board();
  snapshot.hand = ['hardening', 'guard', 'pulse', 'blackhole'];
  snapshot.hasReply = true;
  const neutron = planner.plan(snapshot, 'normal');
  const aab = planner.plan(snapshot, 'hard');
  assert.equal(neutron.searchDepth, 3);
  assert.equal(aab.searchDepth, 6);
  assert.ok(Number.isFinite(aab.futureValue));
  assert.ok(aab.evaluated > neutron.evaluated);
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

test('Neutron and AAB use a data barrier only when it meaningfully reduces the reply lane', () => {
  const snapshot = board();
  snapshot.units[0].x = 360;
  snapshot.hasReply = true;
  snapshot.hand = ['data-barrier'];
  snapshot.structureCandidates = [{ x: 600, y: 355 }, { x: 600, y: 465 }];
  const plan = planner.plan(snapshot, 'normal');
  assert.equal(plan.structure?.type, 'data-barrier');
  assert.equal(plan.structure?.x, 600);
  assert.match(plan.intent, /진입로/);
});

test('rollouts keep data barriers fixed and let only their owner pass through', () => {
  const snapshot = board();
  snapshot.units[0].y = 500;
  snapshot.bricks = [{x:950,y:355,vx:0,vy:0,width:18,height:64,mass:2,
    restitution:.58,frictionMultiplier:1,barrier:true,owner:1}];
  const shot = {dx:-1,dy:0,power:.65};
  const friendly = planner.simulate(snapshot,shot);
  snapshot.bricks[0].owner = 0;
  const blocked = planner.simulate(snapshot,shot);
  assert.equal(friendly.world.bricks[0].x,950);
  assert.equal(blocked.world.bricks[0].x,950);
  assert.ok(friendly.world.units[1].x < blocked.world.units[1].x - 50);
});

test('guard satellites repel stones and movable bricks in the rollout', () => {
  const snapshot = board();
  snapshot.units[0] = { ...snapshot.units[0], x: 800, ability: {
    guard: true, guardAngle: 0, stacks: { guard: 1 }, destroyedGuardSatellites: []
  } };
  snapshot.units[1].y = 500;
  snapshot.bricks = [{ x: 854, y: 355, vx: 0, vy: 0, width: 18, height: 18,
    mass: 2, restitution: .58, frictionMultiplier: 1.5 }];
  const result = planner.simulate(snapshot, { dx: -1, dy: 0, power: .06 });
  assert.notEqual(result.world.bricks[0].x, snapshot.bricks[0].x);

  const attack = board();
  attack.units[0] = { ...attack.units[0], x: 800, ability: {
    guard: true, guardAngle: 0, stacks: { guard: 1 }, destroyedGuardSatellites: []
  } };
  const guarded = planner.simulate(attack, { dx: -1, dy: 0, power: .55 });
  delete attack.units[0].ability;
  const exposed = planner.simulate(attack, { dx: -1, dy: 0, power: .55 });
  assert.notEqual(guarded.world.units[1].x, exposed.world.units[1].x);
});

test('charged release detonates on simulated impact, halves allied force, and removes nearby structures', () => {
  const snapshot = board();
  snapshot.units[0] = { ...snapshot.units[0], x: 1010, y: 355 };
  snapshot.units[1] = { ...snapshot.units[1], ability: { pulse: true, stacks: {} } };
  snapshot.units.push(
    { id: 'ally', owner: 1, x: 950, y: 430, vx: 0, vy: 0, radius: 29, status: 'resting' },
    { id: 'bystander', owner: 0, x: 1070, y: 280, vx: 0, vy: 0, radius: 29, status: 'resting' }
  );
  snapshot.bricks = [
    { x: 1000, y: 355, vx: 0, vy: 0, width: 18, height: 18, mass: 2, restitution: .58 },
    { x: 1060, y: 500, vx: 0, vy: 0, width: 18, height: 64, barrier: true, owner: 0 }
  ];

  const result = planner.simulate(snapshot, { dx: -1, dy: 0, power: .4 }, .001);
  assert.equal(result.world.units[1].ability.pulse, false);
  assert.equal(result.world.bricks.length, 0);
  const allySpeed = Math.hypot(result.world.units[2].vx, result.world.units[2].vy);
  const bystanderSpeed = Math.hypot(result.world.units[3].vx, result.world.units[3].vy);
  assert.ok(allySpeed > 0);
  assert.ok(Math.abs(allySpeed / bystanderSpeed - .5) < .03);
});

test('AAB chooses the black-hole timing that changes a close-range board state', () => {
  const fixture = SCENARIOS.find(item => item.name === 'close-range-removal');
  const report = summarizePlan(fixture, 'hard');
  assert.ok(report.choice.cards.includes('blackhole'));
  assert.equal(report.choice.cardTiming.find(item => item.card === 'blackhole').at, .7);
  assert.ok(report.counterfactual.scoreDeltaFromCards > 0);
  assert.ok(report.counterfactual.totalUnitDisplacementFromCards > 0);
});
