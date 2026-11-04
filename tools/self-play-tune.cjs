const crypto = require('node:crypto');
const planner = require('../ai-planner.js');
const balance = require('../ai-balance.js');

const BASELINE_WEIGHTS = { ...planner.defaultWeights };
const PROFILES = [
  { name: 'balanced', style: 'balanced', weights: { ...BASELINE_WEIGHTS } },
  { name: 'aggressive', style: 'attacker', weights: { ...BASELINE_WEIGHTS, knockout: 1.35, replyRisk: .38, cardCost: 3.5 } },
  { name: 'counterplay', style: 'defender', weights: { ...BASELINE_WEIGHTS, knockout: 1.12, replyRisk: .78, cardCost: 5.5 } },
  { name: 'controller', style: 'controller', weights: { ...BASELINE_WEIGHTS, replyRisk: .62, cardCost: 4 } }
];
const QUICK_SEARCH = { candidates: 24, offsets: [.9, 1, 1.1], replyCount: 3, finalists: 1,
  cardDepth: 2, uncertainty: .001, lookaheadDepth: 1, lookaheadCandidates: 1,
  lookaheadReplyCount: 1, lookaheadBranches: 1 };
// Use the same live map rules as the game; the self-play envelope is fingerprinted separately.
const MAPS = [
  { name: 'classic', id: 'classic', ...balance.maps.classic },
  { name: 'ice', id: 'ice', ...balance.maps.ice },
  { name: 'items', id: 'items', ...balance.maps.items, items: true },
  { name: 'moving-walls', id: 'movingWalls', ...balance.maps.movingWalls },
  { name: 'duel', id: 'duel', ...balance.maps.duel }
];
const DECK = ['hardening', 'guard', 'pulse', 'blackhole', 'bluffing', 'brick', 'data-barrier',
  'escape', 'repulsion-field'];
const SCENARIO_PHYSICS = {
  unitRadius: balance.motion.unitRadius,
  launchXByOwner: { standard: [balance.table.launchX, balance.table.launchX],
    duel: [balance.table.left + balance.motion.unitRadius + 16, balance.table.launchX] },
  blackholeRange: balance.blackhole.range, blackholeDuration: balance.blackhole.duration,
  blackholeImpulse: balance.blackhole.impulse,
  blackholeFrictionMultiplier: balance.blackhole.affectedFrictionMultiplier,
  blackholeTriggerRangeMultiplier: balance.blackhole.triggerRangeMultiplier,
  pulseRange: balance.pulse.range, pulseImpulse: balance.pulse.impulse,
  pulseTriggerRangeMultiplier: balance.pulse.triggerRangeMultiplier,
  pulseTriggerImpulseMultiplier: balance.pulse.triggerImpulseMultiplier,
  koPoints: balance.scoring.knockoutPoints, turns: balance.turnsPerPlayer * 2, simulationSeconds: 9,
  brick: { width: balance.structure.width, height: balance.structure.height, mass: balance.structure.mass,
    restitution: balance.structure.restitution,
    frictionMultiplier: { default: balance.structure.frictionMultiplier,
      dataBarrier: balance.structure.barrierFrictionMultiplier } }
};
const MAX_GAMES_PER_SCENARIO = 8;
const MAX_TUNE_CANDIDATES = 7;
const DEFAULT_TUNE_CANDIDATES = 5;
const MAX_TUNE_GENERATIONS = 4;
const MAX_TRAINING_POLICIES = 21;
const TUNER_VERSION = 'adaptive-neighborhood-v1';

function randomFor(seed) {
  let value = (seed >>> 0) || 1;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function assertFiniteWorld(world, context) {
  for (const [index, points] of world.points.entries()) if (!Number.isFinite(points))
    throw new Error(`Self-play produced a non-finite score for player ${index} at ${context}`);
  for (const unit of world.units) for (const key of ['x', 'y', 'vx', 'vy']) if (!Number.isFinite(unit[key]))
    throw new Error(`Self-play produced a non-finite unit ${key} for ${unit.id} at ${context}: ${JSON.stringify(unit)}`);
  for (const brick of world.bricks) for (const key of ['x', 'y', 'vx', 'vy']) if (!Number.isFinite(brick[key]))
    throw new Error(`Self-play produced a non-finite structure ${key} for ${brick.id} at ${context}`);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function balanceFingerprint() {
  const game = planner.balanceFingerprint();
  const harness = crypto.createHash('sha256').update(stableStringify({
    tunerVersion: TUNER_VERSION, modelVersion: planner.modelVersion, maps: MAPS,
    physics: SCENARIO_PHYSICS, deck: DECK, search: QUICK_SEARCH
  })).digest('hex').slice(0, 16);
  return { game, harness, value: `${game}:${harness}`, source: 'shared-game-balance+simulation-harness' };
}

function playGame(profileA, profileB, seed, startingPlayer, scenario) {
  const random = randomFor(seed);
  const map = scenario || MAPS[Math.floor(random() * MAPS.length)];
  const decks = [DECK.slice(), DECK.slice()];
  for (const deck of decks) for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const launchXByOwner = map.duel ? SCENARIO_PHYSICS.launchXByOwner.duel : SCENARIO_PHYSICS.launchXByOwner.standard;
  const world = { actor: startingPlayer, turn: 0, launchId: '', seed, mapId: map.id,
    friction: map.friction, walls: map.walls, mapTime: random() * 12, turnsPerPlayer: balance.turnsPerPlayer,
    koPoints: SCENARIO_PHYSICS.koPoints,
    replyKoPoints: SCENARIO_PHYSICS.koPoints, duel: Boolean(map.duel), unitRadius: SCENARIO_PHYSICS.unitRadius,
    launchXByOwner, blackholeRange: SCENARIO_PHYSICS.blackholeRange,
    blackholeDuration: SCENARIO_PHYSICS.blackholeDuration,
    blackholeImpulse: SCENARIO_PHYSICS.blackholeImpulse,
    blackholeFrictionMultiplier: SCENARIO_PHYSICS.blackholeFrictionMultiplier,
    blackholeTriggerRangeMultiplier: SCENARIO_PHYSICS.blackholeTriggerRangeMultiplier,
    pulseRange: SCENARIO_PHYSICS.pulseRange, pulseImpulse: SCENARIO_PHYSICS.pulseImpulse,
    pulseTriggerRangeMultiplier: SCENARIO_PHYSICS.pulseTriggerRangeMultiplier,
    pulseTriggerImpulseMultiplier: SCENARIO_PHYSICS.pulseTriggerImpulseMultiplier,
    points: [0, 0], units: [], bricks: [], triggers: [], hasReply: true };
  const triggerUsed = [false, false];
  const actions = [emptyActions(), emptyActions()];
  for (let turn = 0; turn < SCENARIO_PHYSICS.turns; turn += 1) {
    const owner = (startingPlayer + turn) % 2;
    const unit = { id: `stone-${turn}`, owner, x: launchXByOwner[owner], y: 365, vx: 0, vy: 0,
      radius: SCENARIO_PHYSICS.unitRadius, status: 'ready', heroFriction: 1, powerScale: 1,
      fallPenalty: 0, pendingPulseTriggers: [] };
    world.actor = owner; world.turn = turn; world.launchId = unit.id; world.hasReply = turn < SCENARIO_PHYSICS.turns - 1;
    if (map.items) {
      const triggerRadius = SCENARIO_PHYSICS.unitRadius * .5;
      const triggerTypes = ['guard', 'hardening', 'pulse', 'blackhole'];
      for (let attempt = 0; attempt < 120; attempt += 1) {
        const point = { x: balance.table.left + triggerRadius + 12 + random() *
          (balance.table.right - balance.table.left - 2 * (triggerRadius + 12)),
        y: balance.table.top + triggerRadius + 12 + random() *
          (balance.table.bottom - balance.table.top - 2 * (triggerRadius + 12)) };
        const wallHit = map.walls && planner.wallSegments(world.mapTime).some(wall =>
          point.x + triggerRadius + 10 > wall.x && point.x - triggerRadius - 10 < wall.x + wall.width &&
          point.y + triggerRadius + 10 > wall.y && point.y - triggerRadius - 10 < wall.y + wall.height);
        const blocked = world.units.some(other => other.status !== 'fallen' &&
          Math.hypot(point.x - other.x, point.y - other.y) < triggerRadius + other.radius + 12) ||
          world.bricks.some(brick => Math.abs(point.x - brick.x) < triggerRadius + brick.width / 2 + 10 &&
            Math.abs(point.y - brick.y) < triggerRadius + brick.height / 2 + 10) ||
          world.triggers.some(other => Math.hypot(point.x - other.x, point.y - other.y) < triggerRadius + other.radius + 14) ||
          wallHit;
        if (blocked) continue;
        const type = triggerTypes[Math.floor(random() * triggerTypes.length)];
        world.triggers.push({ ...point, type, radius: triggerRadius,
          range: type === 'pulse' ? SCENARIO_PHYSICS.pulseRange * SCENARIO_PHYSICS.pulseTriggerRangeMultiplier :
            type === 'blackhole' ? SCENARIO_PHYSICS.blackholeRange * SCENARIO_PHYSICS.blackholeTriggerRangeMultiplier : undefined,
          impulse: type === 'pulse' ? SCENARIO_PHYSICS.pulseImpulse * SCENARIO_PHYSICS.pulseTriggerImpulseMultiplier : undefined });
        break;
      }
    }
    world.units.push(unit);
    const profile = owner === 0 ? profileA : profileB;
    const hand = decks[owner].slice(0, 3);
    const enemyHand = decks[1 - owner].slice(0, 3);
    const triggerCandidates = triggerUsed[owner] ? [] : [
      { x: 780, y: 285 }, { x: 650, y: 355 }, { x: 520, y: 425 }, { x: 850, y: 450 }
    ];
    const launchX = launchXByOwner[owner];
    const movingWalls = map.walls ? planner.wallSegments(world.mapTime) : [];
    const launchYCandidates = [];
    for (let y = balance.table.top + unit.radius + 4; y <= balance.table.bottom - unit.radius - 4; y += 24) {
      const overlapsUnit = world.units.some(other => other.id !== unit.id && other.status !== 'fallen' &&
        Math.hypot(other.x - launchX, other.y - y) < other.radius + unit.radius + 2);
      const overlapsBrick = world.bricks.some(brick => Math.abs(brick.x - launchX) < brick.width / 2 + unit.radius &&
        Math.abs(brick.y - y) < brick.height / 2 + unit.radius);
      const overlapsWall = movingWalls.some(wall => launchX + unit.radius > wall.x &&
        launchX - unit.radius < wall.x + wall.width && y + unit.radius > wall.y &&
        y - unit.radius < wall.y + wall.height);
      if (!overlapsUnit && !overlapsBrick && !overlapsWall) launchYCandidates.push(y);
    }
    const structureCandidates = world.units.filter(item => item.owner !== owner && item.status !== 'fallen')
      .sort((a, b) => a.x - b.x).slice(0, 2)
      .flatMap(enemy => [82, 145, 210].flatMap(lead => [-54, 0, 54].map(offset => ({
        x: Math.max(120, Math.min(1030, enemy.x + lead)), y: Math.max(100, Math.min(610, enemy.y + offset))
      }))))
      .slice(0, 6);
    const snapshot = { ...world, hand, enemyHand, launchYCandidates, triggerCandidates, structureCandidates,
      style: profile.style };
    const result = planner.plan(snapshot, 'hard', { weights: profile.weights, settings: QUICK_SEARCH });
    for (const key of ['dx', 'dy', 'power', 'launchY']) if (!Number.isFinite(result[key]))
      throw new Error(`Planner returned a non-finite ${key} on ${map.name}, turn ${turn}`);
    for (const tactic of result.tactics || []) actions[owner].cards[tactic.card] = (actions[owner].cards[tactic.card] || 0) + 1;
    if (result.trigger) actions[owner].triggers[result.trigger.type] = (actions[owner].triggers[result.trigger.type] || 0) + 1;
    if (result.structure) actions[owner].structures[result.structure.type] = (actions[owner].structures[result.structure.type] || 0) + 1;
    if (result.trigger) {
      world.triggers.push({ ...result.trigger, radius: SCENARIO_PHYSICS.unitRadius * .5,
        range: result.trigger.type === 'pulse' ? SCENARIO_PHYSICS.pulseRange * SCENARIO_PHYSICS.pulseTriggerRangeMultiplier :
          world.blackholeRange * world.blackholeTriggerRangeMultiplier,
        impulse: result.trigger.type === 'pulse' ? SCENARIO_PHYSICS.pulseImpulse *
          SCENARIO_PHYSICS.pulseTriggerImpulseMultiplier : undefined });
      triggerUsed[owner] = true;
    }
    const actionWorld = planner.cloneWorld(world);
    if (result.structure) actionWorld.bricks.push({
      id: `selfplay-${result.structure.type}-${turn}`,
      x: result.structure.x, y: result.structure.y, owner,
      barrier: result.structure.type === 'data-barrier',
      expiresAtTurn: result.structure.type === 'data-barrier' ? turn + 2 : null,
      ...SCENARIO_PHYSICS.brick, frictionMultiplier: result.structure.type === 'data-barrier'
        ? SCENARIO_PHYSICS.brick.frictionMultiplier.dataBarrier : SCENARIO_PHYSICS.brick.frictionMultiplier.default,
      vx: 0, vy: 0
    });
    const moved = planner.simulate(actionWorld, result, SCENARIO_PHYSICS.simulationSeconds, result.tactics || []);
    assertFiniteWorld(moved.world, `${map.name}, turn ${turn}, mapTime=${world.mapTime}, friction=${world.friction}; ` +
      `before=${JSON.stringify(world.units)}; shot=${JSON.stringify(result)}; ` +
      `triggers=${JSON.stringify(world.triggers)}; bricks=${JSON.stringify(world.bricks)}; ` +
      `walls=${JSON.stringify(map.walls ? planner.wallSegments(world.mapTime) : [])}`);
    world.units = moved.world.units;
    world.bricks = moved.world.bricks;
    world.triggers = moved.world.triggers;
    world.points = moved.world.points;
    world.mapTime = moved.world.mapTime;
    for (const tactic of result.tactics || []) {
      const index = decks[owner].indexOf(tactic.card);
      if (index >= 0) decks[owner].splice(index, 1);
    }
    if (result.structure) {
      const index = decks[owner].indexOf(result.structure.type);
      if (index >= 0) decks[owner].splice(index, 1);
    }
    world.units.forEach(item => { if (item.status === 'ready') item.status = 'resting'; });
  }
  const totals = planner.score(world);
  if (!totals.every(Number.isFinite)) throw new Error(`Self-play ended with non-finite totals on ${map.name}`);
  return { winner: totals[0] === totals[1] ? -1 : totals[0] > totals[1] ? 0 : 1,
    margin: totals[0] - totals[1], totals, actions, map: map.name };
}

function emptyActions() { return { cards: {}, triggers: {}, structures: {} }; }

function makeRow(name, style) {
  return { name, style, wins: 0, losses: 0, draws: 0, margin: 0, maps: {}, archetypes: {},
    cards: {}, triggers: {}, structures: {} };
}

function recordResult(row, opponent, mapName, outcome, pointMargin, actions) {
  row.margin += pointMargin;
  const map = row.maps[mapName] ||= { wins: 0, losses: 0, draws: 0, margin: 0, games: 0 };
  const archetype = row.archetypes[opponent.name] ||= { style: opponent.style, wins: 0, losses: 0, draws: 0, margin: 0, games: 0 };
  for (const bucket of [map, archetype]) {
    bucket.games += 1; bucket.margin += pointMargin;
    if (outcome === 0) bucket.draws += 1;
    else if (outcome > 0) bucket.wins += 1;
    else bucket.losses += 1;
  }
  if (outcome === 0) row.draws += 1;
  else if (outcome > 0) row.wins += 1;
  else row.losses += 1;
  for (const [group, counts] of Object.entries(actions)) for (const [key, count] of Object.entries(counts)) {
    row[group][key] = (row[group][key] || 0) + count;
  }
}

function comparePair(profileA, profileB, seed, scenario) {
  const firstPlayer = seed % 2;
  return [
    playGame(profileA, profileB, seed, firstPlayer, scenario),
    playGame(profileA, profileB, seed, 1 - firstPlayer, scenario)
  ];
}

function runTournament(gamesPerPair = 1, options = {}) {
  const profiles = options.profiles || PROFILES;
  const scenarios = options.scenarios || MAPS;
  const seedBase = options.seedBase ?? 8341;
  const rows = profiles.map(profile => makeRow(profile.name, profile.style));
  const matches = [];
  const count = Math.max(1, Math.min(MAX_GAMES_PER_SCENARIO, Math.floor(gamesPerPair) || 1));
  for (let a = 0; a < profiles.length; a += 1) for (let b = a + 1; b < profiles.length; b += 1) {
    for (let mapIndex = 0; mapIndex < scenarios.length; mapIndex += 1) {
      for (let game = 0; game < count; game += 1) {
        const seed = seedBase + a * 1009 + b * 131 + mapIndex * 7919 + game * 17;
        for (const result of comparePair(profiles[a], profiles[b], seed, scenarios[mapIndex])) {
          const outcomeA = result.winner < 0 ? 0 : result.winner === 0 ? 1 : -1;
          recordResult(rows[a], profiles[b], result.map, outcomeA, result.margin, result.actions[0]);
          recordResult(rows[b], profiles[a], result.map, -outcomeA, -result.margin, result.actions[1]);
          matches.push({ a: profiles[a].name, b: profiles[b].name, seed,
            winner: result.winner < 0 ? 'draw' : result.winner === 0 ? profiles[a].name : profiles[b].name,
            margin: result.margin, map: result.map });
        }
      }
    }
  }
  rows.sort((a, b) => (b.wins + b.draws * .5) - (a.wins + a.draws * .5) || b.margin - a.margin);
  return { games: matches.length, rows, winner: profiles.find(profile => profile.name === rows[0]?.name), matches };
}

function weightSignature(weights) { return stableStringify(weights); }

function normalizeWeightPatch(baseWeights, patch) {
  if (patch === undefined) return { ...baseWeights };
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new Error('--weights must be a JSON object of planner weight names and numeric values');
  const weights = { ...baseWeights };
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.prototype.hasOwnProperty.call(baseWeights, key))
      throw new Error(`Unknown tunable weight: ${key}. Available: ${Object.keys(baseWeights).join(', ')}`);
    if (!Number.isFinite(value) || value < 0)
      throw new Error(`Weight ${key} must be a finite, non-negative number`);
    weights[key] = value;
  }
  return weights;
}

function candidatePolicies(baseWeights = BASELINE_WEIGHTS, overrideWeights) {
  const center = normalizeWeightPatch(baseWeights, overrideWeights);
  const candidates = [];
  const seen = new Set();
  const add = (id, weights) => {
    const signature = weightSignature(weights);
    if (seen.has(signature) || candidates.length >= MAX_TUNE_CANDIDATES) return;
    seen.add(signature);
    candidates.push({ id, weights: { ...weights } });
  };
  add('baseline', baseWeights);
  if (weightSignature(center) !== weightSignature(baseWeights)) add('start', center);

  // Relative presets keep their meaning when the planner's default balance changes.
  const specifications = [
    ['knockout-up', { knockout: 1.12 }],
    ['reply-risk-up', { replyRisk: 1.14 }],
    ['card-cost-down', { cardCost: .86 }],
    ['lookahead-up', { lookahead: 1.16 }],
    ['pressure-mix', { knockout: 1.08, replyRisk: 1.08, cardCost: .9, lookahead: 1.1 }]
  ];
  for (const [id, factors] of specifications) {
    const weights = { ...center };
    for (const [key, factor] of Object.entries(factors)) {
      if (Object.prototype.hasOwnProperty.call(weights, key)) weights[key] = Math.max(0, weights[key] * factor);
    }
    add(id, weights);
  }
  return candidates;
}

function adaptiveParentPool(training, scenarios) {
  const parents = [];
  const seen = new Set();
  const add = candidate => {
    if (!candidate) return;
    const signature = weightSignature(candidate.weights);
    if (seen.has(signature)) return;
    seen.add(signature);
    parents.push(candidate);
  };
  const ranking = training.slice().sort((a, b) => b.winRate - a.winRate || b.margin - a.margin);
  ranking.slice(0, 2).forEach(add);
  for (const scenario of scenarios) {
    const best = training.slice().sort((a, b) => {
      const score = row => {
        const bucket = row.perMap?.[scenario.name];
        return bucket ? (bucket.wins + bucket.draws * .5) / Math.max(1, bucket.games) : 0;
      };
      return score(b) - score(a) ||
        (b.perMap?.[scenario.name]?.margin || 0) - (a.perMap?.[scenario.name]?.margin || 0);
    })[0];
    add(best);
  }
  return parents;
}

function adaptiveNeighborhood(parents, baseWeights, generation, count, seed, excludedSignatures = new Set()) {
  if (!parents.length || count <= 0) return [];
  const keys = Object.keys(baseWeights).filter(key => Number.isFinite(baseWeights[key]));
  const random = randomFor(seed);
  const candidates = [];
  const seen = new Set();
  const add = (id, weights) => {
    const signature = weightSignature(weights);
    if (seen.has(signature) || excludedSignatures.has(signature) || candidates.length >= count) return false;
    seen.add(signature);
    candidates.push({ id, weights: { ...weights }, generation });
    return true;
  };
  const elite = parents[0];
  add(`g${generation}-elite-${elite.id}`, elite.weights);
  const decay = Math.pow(.62, Math.max(0, generation - 1));
  let attempt = 0;
  const maxAttempts = count * 30;
  while (candidates.length < count && attempt < maxAttempts) {
    const parent = parents[(attempt + generation - 1) % parents.length];
    const weights = { ...parent.weights };
    const changedCount = attempt < keys.length * 2 ? 1 : Math.min(keys.length, 1 + Math.floor(random() * 3));
    const chosen = new Set();
    while (chosen.size < changedCount) chosen.add(keys[Math.floor(random() * keys.length)]);
    for (const key of chosen) {
      const base = Math.max(0, baseWeights[key]);
      const current = Math.max(0, parent.weights[key]);
      const step = Math.max(current * .18, base * .08, .05) * decay;
      const sign = random() < .5 ? -1 : 1;
      const boundedMin = Math.max(0, base * .3);
      const boundedMax = Math.max(base * 2.5, base + .25);
      weights[key] = Math.max(boundedMin, Math.min(boundedMax,
        current + sign * step * (.65 + random() * .7)));
    }
    add(`g${generation}-n${attempt + 1}-${parent.id}`, weights);
    attempt += 1;
  }
  // Deterministic one-axis fallbacks guarantee a full generation even when random proposals collide.
  for (let offset = 0; candidates.length < count && offset < keys.length * count * 2; offset += 1) {
    const key = keys[offset % keys.length];
    const parent = parents[Math.floor(offset / keys.length) % parents.length];
    const weights = { ...parent.weights };
    const base = Math.max(0, baseWeights[key]);
    const step = Math.max(Math.abs(weights[key]) * .2, base * .1, .05) * decay;
    const sign = offset % 2 ? -1 : 1;
    weights[key] = Math.max(Math.max(0, base * .3), Math.min(Math.max(base * 2.5, base + .25),
      Math.max(0, weights[key]) + sign * step));
    add(`g${generation}-axis-${key}-${offset}`, weights);
  }
  return candidates;
}

function evaluatePolicy(policy, opponents, seeds, scenarios, onProgress, progress = { done: 0, total: 0 }) {
  const row = makeRow(policy.id, 'candidate');
  const byMapAndArchetype = {};
  for (let mapIndex = 0; mapIndex < scenarios.length; mapIndex += 1) {
    const scenario = scenarios[mapIndex];
    for (const opponent of opponents) for (const seed of seeds) {
      const candidate = { name: policy.id, style: 'balanced', weights: policy.weights };
      const [asFirst, asSecond] = comparePair(candidate, opponent, seed + mapIndex * 7919, scenario);
      for (const [result, candidateOwner] of [[asFirst, 0], [asSecond, 0]]) {
        const outcome = result.winner < 0 ? 0 : result.winner === candidateOwner ? 1 : -1;
        const pointMargin = result.margin * (candidateOwner === 0 ? 1 : -1);
        recordResult(row, opponent, result.map, outcome, pointMargin, result.actions[candidateOwner]);
        const key = `${result.map}/${opponent.name}`;
        const group = byMapAndArchetype[key] ||= { map: result.map, opponent: opponent.name,
          style: opponent.style, wins: 0, losses: 0, draws: 0, margin: 0, games: 0 };
        group.games += 1; group.margin += pointMargin;
        if (outcome > 0) group.wins += 1;
        else if (outcome < 0) group.losses += 1;
        else group.draws += 1;
      }
      progress.done += 2;
      onProgress?.({ ...progress, policy: policy.id, map: scenario.name, opponent: opponent.name });
    }
  }
  return { id: policy.id, weights: policy.weights, wins: row.wins, losses: row.losses, draws: row.draws,
    games: row.wins + row.losses + row.draws, margin: row.margin,
    winRate: (row.wins + row.draws * .5) / Math.max(1, row.wins + row.losses + row.draws),
    perMap: row.maps, perArchetype: row.archetypes, perMapArchetype: byMapAndArchetype,
    cardUse: row.cards, triggerUse: row.triggers, structureUse: row.structures };
}

function tuneWeights(options = {}) {
  const trainingSeeds = Array.from({ length: options.gamesPerScenario || 1 }, (_, index) =>
    (options.seedBase ?? 17381) + index * 104729);
  const holdoutSeeds = Array.from({ length: options.holdoutGamesPerScenario || 1 }, (_, index) =>
    (options.holdoutSeedBase ?? 900001) + index * 130363);
  const opponents = options.opponents || PROFILES;
  const scenarios = options.scenarios || MAPS;
  const candidateCount = Math.max(1, Math.min(MAX_TUNE_CANDIDATES,
    Math.floor(options.candidateCount || DEFAULT_TUNE_CANDIDATES)));
  const generations = Math.max(1, Math.min(MAX_TUNE_GENERATIONS,
    Math.floor(options.generations || 2), Math.floor(MAX_TRAINING_POLICIES / candidateCount)));
  const startWeights = normalizeWeightPatch(BASELINE_WEIGHTS, options.weights);
  const pairedMatchCount = opponents.length * trainingSeeds.length * scenarios.length * 2;
  const progress = { done: 0, total: 0 };
  const training = [];
  const seenTraining = new Set();
  const generationSummary = [];
  let generationCandidates = candidatePolicies(BASELINE_WEIGHTS, options.weights).slice(0, candidateCount);
  for (let generation = 1; generation <= generations; generation += 1) {
    if (generation > 1) {
      const parents = adaptiveParentPool(training, scenarios);
      const seed = (options.seedBase ?? 17381) ^ (generation * 0x9e3779b9) ^
        parseInt(crypto.createHash('sha256').update(weightSignature(parents[0]?.weights || startWeights))
          .digest('hex').slice(0, 8), 16);
      generationCandidates = adaptiveNeighborhood(parents, BASELINE_WEIGHTS, generation,
        candidateCount, seed >>> 0, seenTraining);
    }
    const uniqueCandidates = generationCandidates.filter(candidate => {
      const signature = weightSignature(candidate.weights);
      if (seenTraining.has(signature)) return false;
      seenTraining.add(signature);
      candidate.generation = generation;
      return true;
    });
    progress.total += pairedMatchCount * uniqueCandidates.length;
    const generationResults = uniqueCandidates.map(candidate => {
      const result = evaluatePolicy(candidate, opponents, trainingSeeds, scenarios,
        options.onProgress ? info => options.onProgress({ ...info, generation }) : null, progress);
      result.generation = generation;
      training.push(result);
      return result;
    });
    const leader = generationResults.slice().sort((a, b) => b.winRate - a.winRate || b.margin - a.margin)[0] ||
      training.slice().sort((a, b) => b.winRate - a.winRate || b.margin - a.margin)[0];
    generationSummary.push({ generation, evaluated: generationResults.length,
      candidateIds: generationResults.map(result => result.id), leader: leader?.id || null,
      leaderTrainingWinRate: leader?.winRate ?? null });
  }
  const candidates = training.map(result => ({ id: result.id, weights: result.weights }));
  const baseline = training.find(result => result.id === 'baseline') || training[0];
  const rankedTraining = training.slice().sort((a, b) => b.winRate - a.winRate || b.margin - a.margin);
  const selected = rankedTraining[0];
  const mapLeaders = scenarios.map(scenario => training.slice().sort((a, b) => {
    const score = row => {
      const bucket = row.perMap?.[scenario.name];
      return bucket ? (bucket.wins + bucket.draws * .5) / Math.max(1, bucket.games) : 0;
    };
    return score(b) - score(a) ||
      (b.perMap?.[scenario.name]?.margin || 0) - (a.perMap?.[scenario.name]?.margin || 0);
  })[0]).filter(Boolean);
  const holdoutPolicies = [];
  const seenHoldout = new Set();
  for (const candidate of [baseline, selected, ...mapLeaders]) {
    if (!candidate) continue;
    const signature = weightSignature(candidate.weights);
    if (seenHoldout.has(signature)) continue;
    seenHoldout.add(signature);
    holdoutPolicies.push({ id: candidate.id, weights: candidate.weights });
  }
  const holdoutProgress = { done: 0, total:
    opponents.length * holdoutSeeds.length * scenarios.length * 2 * holdoutPolicies.length };
  const holdout = holdoutPolicies.map(candidate => evaluatePolicy(candidate, opponents, holdoutSeeds, scenarios,
    options.onProgress ? info => options.onProgress({ ...info, phase: 'holdout' }) : null, holdoutProgress));
  const holdoutBySignature = new Map(holdout.map(result => [weightSignature(result.weights), result]));
  const selectedHoldout = holdoutBySignature.get(weightSignature(selected.weights));
  const baselineHoldout = holdoutBySignature.get(weightSignature(baseline.weights));
  const weightsByMap = {};
  const mapRecommendations = {};
  for (const scenario of scenarios) {
    const mapScore = result => {
      const bucket = result?.perMap?.[scenario.name];
      return bucket ? (bucket.wins + bucket.draws * .5) / Math.max(1, bucket.games) : 0;
    };
    const bestTraining = training.slice().sort((a, b) => mapScore(b) - mapScore(a) ||
      (b.perMap[scenario.name]?.margin || 0) - (a.perMap[scenario.name]?.margin || 0))[0];
    const candidateHoldout = bestTraining && holdoutBySignature.get(weightSignature(bestTraining.weights));
    const baselineRate = mapScore(baselineHoldout);
    const candidateRate = mapScore(candidateHoldout);
    const improved = bestTraining && weightSignature(bestTraining.weights) !== weightSignature(baseline.weights) &&
      candidateRate > baselineRate;
    mapRecommendations[scenario.id] = { candidate: improved ? bestTraining.id : 'baseline',
      trainingWinRate: mapScore(bestTraining), holdoutWinRate: improved ? candidateRate : baselineRate,
      baselineHoldoutWinRate: baselineRate, improvedOnHoldout: Boolean(improved) };
    if (improved) weightsByMap[scenario.id] = bestTraining.weights;
  }
  const globalImproved = selected.id !== 'baseline' && selectedHoldout &&
    selectedHoldout.winRate > (baselineHoldout?.winRate ?? 1);
  return { balanceFingerprint: balanceFingerprint(), scope: { maps: scenarios.map(map => map.id),
      opponents: opponents.map(opponent => opponent.name), candidates: candidates.map(candidate => candidate.id) },
    seedSets: { training: trainingSeeds, holdout: holdoutSeeds },
    training, holdout, selectedByTraining: selected.id, baselineTrainingWinRate: baseline.winRate,
    selectedHoldoutWinRate: selectedHoldout?.winRate ?? null,
    holdoutBeatsBaseline: Boolean(selectedHoldout && selectedHoldout.winRate >
      (baselineHoldout?.winRate ?? 1)),
    recommendation: globalImproved ? selected.id : 'no-change-recommended',
    adaptiveSearch: { method: TUNER_VERSION, requestedGenerations: generations,
      candidatesPerGeneration: candidateCount, maxTrainingCandidates: MAX_TRAINING_POLICIES,
      trainedCandidateCount: training.length, holdoutCandidateCount: holdout.length,
      generations: generationSummary },
    mapRecommendations, recommendedPolicy: { version: 1, plannerModelVersion: planner.modelVersion,
      balanceFingerprint: planner.balanceFingerprint(),
      simulationFingerprint: balanceFingerprint().harness,
      weights: globalImproved ? selected.weights : BASELINE_WEIGHTS,
      weightsByMap },
    note: 'Recommendation only. Candidate weights are never written to or promoted into the game automatically.' };
}

function parseArgs(argv) {
  const args = { mode: 'tournament', games: 1, seedBase: 8341, holdoutGames: 1,
    candidateCount: DEFAULT_TUNE_CANDIDATES, generations: 2 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--tune') { args.mode = 'tune'; continue; }
    if (token === '--help' || token === '-h') { args.mode = 'help'; continue; }
    const equalsAt = token.indexOf('=');
    const key = token.startsWith('--') && equalsAt >= 0 ? token.slice(0, equalsAt) : token;
    const inline = equalsAt >= 0 ? token.slice(equalsAt + 1) : undefined;
    const value = inline ?? (token.startsWith('--') ? argv[++index] : token);
    if (key === '--games') args.games = Number(value);
    else if (key === '--seed') args.seedBase = Number(value);
    else if (key === '--holdout-games') args.holdoutGames = Number(value);
    else if (key === '--generations') args.generations = Number(value);
    else if (key === '--map') args.maps = String(value).split(',').map(part => part.trim()).filter(Boolean);
    else if (key === '--opponent') args.opponents = String(value).split(',').map(part => part.trim()).filter(Boolean);
    else if (key === '--candidate-count') args.candidateCount = Number(value);
    else if (key === '--weights') args.weights = JSON.parse(value);
    else if (!token.startsWith('--') && /^\d+$/.test(token)) args.games = Number(token);
    else if (token.startsWith('--')) throw new Error(`Unknown option: ${token}`);
  }
  args.games = Math.max(1, Math.min(MAX_GAMES_PER_SCENARIO, Math.floor(args.games) || 1));
  args.holdoutGames = Math.max(1, Math.min(MAX_GAMES_PER_SCENARIO, Math.floor(args.holdoutGames) || 1));
  args.candidateCount = Math.max(1, Math.min(MAX_TUNE_CANDIDATES, Math.floor(args.candidateCount) || MAX_TUNE_CANDIDATES));
  args.generations = Math.max(1, Math.min(MAX_TUNE_GENERATIONS, Math.floor(args.generations) || 2,
    Math.floor(MAX_TRAINING_POLICIES / args.candidateCount)));
  return args;
}

function resolveScope(args) {
  const scenarios = args.maps?.length ? MAPS.filter(map => args.maps.includes(map.id) || args.maps.includes(map.name)) : MAPS;
  const opponents = args.opponents?.length ? PROFILES.filter(profile => args.opponents.includes(profile.name)) : PROFILES;
  const invalidMaps = (args.maps || []).filter(name => !MAPS.some(map => map.id === name || map.name === name));
  const invalidOpponents = (args.opponents || []).filter(name => !PROFILES.some(profile => profile.name === name));
  if (invalidMaps.length) throw new Error(`Unknown map(s): ${invalidMaps.join(', ')}. Available: ${MAPS.map(map => map.id).join(', ')}`);
  if (invalidOpponents.length) throw new Error(`Unknown opponent(s): ${invalidOpponents.join(', ')}. Available: ${PROFILES.map(profile => profile.name).join(', ')}`);
  return { scenarios, opponents };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.mode === 'help') {
      console.log('Usage: node tools/self-play-tune.cjs [gamesPerMap] [--seed N]\n' +
        '       node tools/self-play-tune.cjs --tune [--games N] [--holdout-games N] [--seed N] [--weights JSON]\n' +
        '       [--generations N] [--candidate-count N] [--map classic,ice,items,movingWalls,duel]\n' +
        '       [--opponent balanced,aggressive,counterplay,controller]\n' +
        'Defaults: two bounded adaptive generations, five candidates per generation, and one paired seed per map.\n' +
        'Training evaluates at most 21 unique policies; holdout uses separate seeds on baseline, final, and map leaders.\n' +
        'Use --map and --opponent to scope runtime. Progress is written to stderr. Recommendations are never auto-promoted.');
    } else if (args.mode === 'tune') {
      const scope = resolveScope(args);
      const onProgress = info => console.error(`[tune:${info.phase || 'training'}] ${info.policy} ${info.map} vs ${info.opponent}: ${info.done}/${info.total} paired games`);
      console.log(JSON.stringify({ mode: 'weight-tuning', ...tuneWeights({ gamesPerScenario: args.games,
        holdoutGamesPerScenario: args.holdoutGames, seedBase: args.seedBase, weights: args.weights,
        candidateCount: args.candidateCount, generations: args.generations, onProgress, ...scope }) }, null, 2));
    } else {
      const results = runTournament(args.games, { seedBase: args.seedBase });
      console.log(JSON.stringify({ mode: 'archetype-tournament', balanceFingerprint: balanceFingerprint(),
        games: results.games, perMapAndArchetype: results.rows, note:
          'Diagnostic self-play only. The standings do not auto-promote any policy or modify game weights.' }, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { PROFILES, MAPS, balanceFingerprint, playGame, runTournament, candidatePolicies,
  evaluatePolicy, tuneWeights };
