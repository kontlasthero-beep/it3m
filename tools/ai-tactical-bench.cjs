const planner = require('../ai-planner.js');
const { runTournament } = require('./self-play-tune.cjs');

const QUICK_SETTINGS = {
  candidates: 72, offsets: [.88, .96, 1.04, 1.12], replyCount: 5, finalists: 3,
  cardDepth: 2, uncertainty: 0, lookaheadDepth: 0, lookaheadCandidates: 0,
  lookaheadReplyCount: 0, structureCandidates: 3, structureReplyCount: 2
};

function stone(id, owner, x, y, status = 'resting', extra = {}) {
  return { id, owner, x, y, vx: 0, vy: 0, radius: 29, status, heroFriction: 1,
    powerScale: 1, fallPenalty: 0, pendingPulseTriggers: [], ...extra };
}

function scenario(name, fields) {
  const current = stone('current', 1, 1060, 355, 'ready');
  return { name, actor: 1, turn: 5, launchId: current.id, seed: 100 + name.length,
    friction: .020625, walls: false, mapTime: 1.5, koPoints: 25, replyKoPoints: 25,
    points: [0, 0], units: [current], bricks: [], triggers: [], hasReply: true,
    hand: [], enemyHand: [], ...fields, units: fields.units || [current] };
}

const SCENARIOS = [
  scenario('lead-stone-under-threat', {
    units: [stone('enemy-lead', 0, 470, 355), stone('own-lead', 1, 210, 355),
      stone('current', 1, 1060, 355, 'ready')],
    hand: ['guard', 'hardening', 'bluffing'], enemyHand: ['ammo', 'blackhole']
  }),
  scenario('close-range-removal', {
    units: [stone('enemy-target', 0, 430, 355), stone('current', 1, 1060, 355, 'ready')],
    hand: ['pulse', 'blackhole', 'bluffing'], enemyHand: ['guard']
  }),
  scenario('trigger-setup-opportunity', {
    units: [stone('enemy-lead', 0, 610, 355), stone('own-lead', 1, 260, 355),
      stone('current', 1, 1060, 355, 'ready')],
    hand: ['hardening', 'guard'],
    triggerCandidates: [{ x: 760, y: 285 }, { x: 640, y: 355 }, { x: 520, y: 425 }]
  }),
  scenario('counter-lane-structure', {
    units: [stone('enemy-lead', 0, 370, 355), stone('current', 1, 1060, 355, 'ready')],
    hand: ['brick', 'data-barrier'],
    structureCandidates: [{ x: 600, y: 355 }, { x: 600, y: 465 }, { x: 760, y: 285 }],
    enemyHand: ['ammo', 'blackhole']
  })
];

function summarizePlan(snapshot, difficulty) {
  const result = planner.plan(snapshot, difficulty, { settings: QUICK_SETTINGS });
  const before = planner.score(snapshot);
  const setup = { ...snapshot,
    triggers: result.trigger ? [...snapshot.triggers, { ...result.trigger, radius: 14.5,
      range: result.trigger.type === 'pulse' ? 173 : 184, impulse: result.trigger.type === 'pulse' ? 370 : undefined }] : snapshot.triggers,
    bricks: result.structure ? [...snapshot.bricks, { id: 'bench-structure', x: result.structure.x,
      y: result.structure.y, owner: snapshot.actor, barrier: result.structure.type === 'data-barrier',
      width: 18, height: 64, mass: 2, restitution: .58, frictionMultiplier: 1.5, vx: 0, vy: 0 }] : snapshot.bricks
  };
  const base = planner.simulate(setup, result, 8);
  const withCards = planner.simulate(setup, result, 8, result.tactics || []);
  const impact = values => (values[snapshot.actor] - values[1 - snapshot.actor]) -
    (before[snapshot.actor] - before[1 - snapshot.actor]);
  const distanceDelta = withCards.world.units.reduce((sum, unit) => {
    const noCardUnit = base.world.units.find(item => item.id === unit.id);
    return sum + (noCardUnit ? Math.hypot(unit.x - noCardUnit.x, unit.y - noCardUnit.y) : 0);
  }, 0);
  const cardCounterfactuals = [...new Set(snapshot.hand)].filter(card =>
    ['hardening', 'guard', 'pulse', 'blackhole', 'bluffing'].includes(card)).map(card => {
      const timings = card === 'blackhole' ? [.7, 1] : [0];
      const outcomes = timings.map(at => planner.simulate(setup, result, 8, [{ card, at }]));
      const best = outcomes.map(outcome => {
        const displacement = outcome.world.units.reduce((sum, unit) => {
          const prior = base.world.units.find(item => item.id === unit.id);
          return sum + (prior ? Math.hypot(unit.x - prior.x, unit.y - prior.y) : 0);
        }, 0);
        const knockedOut = snapshot.units.filter(unit => unit.owner !== snapshot.actor && unit.status !== 'fallen').length -
          outcome.world.units.filter(unit => unit.owner !== snapshot.actor && unit.status !== 'fallen').length;
        return { scoreDelta: Number((impact(outcome.scores) - impact(base.scores)).toFixed(2)),
          displacement: Number(displacement.toFixed(2)), knockedOut };
      }).sort((a, b) => b.scoreDelta + b.knockedOut * 25 + b.displacement * .1 -
        (a.scoreDelta + a.knockedOut * 25 + a.displacement * .1))[0];
      return { card, ...best };
    });
  return { choice: { cards: result.tactics.map(item => item.card), trigger: result.trigger?.type || null,
      structure: result.structure?.type || null, shotPower: Number(result.power.toFixed(3)),
      cardTiming: result.tactics.map(item => ({ card: item.card, at: item.at, targetId: item.targetId || null })),
      searchNodes: result.evaluated },
    counterfactual: { shotValue: Number(impact(base.scores).toFixed(2)),
      shotWithChosenCards: Number(impact(withCards.scores).toFixed(2)),
      scoreDeltaFromCards: Number((impact(withCards.scores) - impact(base.scores)).toFixed(2)),
      totalUnitDisplacementFromCards: Number(distanceDelta.toFixed(2)),
      knockedOut: snapshot.units.filter(unit => unit.owner !== snapshot.actor && unit.status !== 'fallen').length -
        withCards.world.units.filter(unit => unit.owner !== snapshot.actor && unit.status !== 'fallen').length,
      cardCounterfactuals }
  };
}

function runTacticalBench() {
  const tactical = SCENARIOS.map(fixture => ({ scenario: fixture.name, difficulty: 'AAB',
    ...summarizePlan(fixture, 'hard') }));
  const tournament = runTournament(1);
  return { tacticalScenarios: tactical, selfPlay: { games: tournament.games,
    standings: tournament.rows.map(({ name, style, wins, losses, draws, margin, cards, triggers, structures }) =>
      ({ name, style, wins, losses, draws, averageMargin: Number((margin / Math.max(1, wins + losses + draws)).toFixed(2)),
        cards, triggers, structures })) } };
}

if (require.main === module) console.log(JSON.stringify(runTacticalBench(), null, 2));

module.exports = { SCENARIOS, summarizePlan, runTacticalBench };
