const planner = require('../ai-planner.js');

const BASELINE_WEIGHTS = { knockout: 1, replyRisk: .5, cardCost: 5, lookahead: .58 };
const PROFILES = [
  { name: 'balanced', style: 'balanced', weights: { ...BASELINE_WEIGHTS } },
  { name: 'aggressive', style: 'attacker', weights: { ...BASELINE_WEIGHTS, knockout: 1.35, replyRisk: .38, cardCost: 3.5 } },
  { name: 'counterplay', style: 'defender', weights: { ...BASELINE_WEIGHTS, knockout: 1.12, replyRisk: .78, cardCost: 5.5 } },
  { name: 'controller', style: 'controller', weights: { ...BASELINE_WEIGHTS, replyRisk: .62, cardCost: 4 } }
];
const QUICK_SEARCH = { candidates: 24, offsets: [.9, 1, 1.1], replyCount: 3, finalists: 1,
  cardDepth: 2, uncertainty: .001, lookaheadDepth: 1, lookaheadCandidates: 1,
  lookaheadReplyCount: 1, lookaheadBranches: 1 };
const DECK = ['hardening', 'guard', 'pulse', 'blackhole', 'bluffing', 'brick', 'data-barrier'];
const MAPS = [
  { friction: .020625, walls: false },
  { friction: .00853875, walls: false },
  { friction: .020625, walls: true }
];

function randomFor(seed) {
  let value = (seed >>> 0) || 1;
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function playGame(profileA, profileB, seed, startingPlayer) {
  const random = randomFor(seed);
  const map = MAPS[Math.floor(random() * MAPS.length)];
  const decks = [DECK.slice(), DECK.slice()];
  for (const deck of decks) for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const world = { actor: startingPlayer, turn: 0, launchId: '', seed,
    friction: map.friction, walls: map.walls, mapTime: random() * 12, koPoints: 25, replyKoPoints: 25,
    points: [0, 0], units: [], bricks: [], triggers: [], hasReply: true };
  const triggerUsed = [false, false];
  const actions = [emptyActions(), emptyActions()];
  for (let turn = 0; turn < 10; turn += 1) {
    const owner = (startingPlayer + turn) % 2;
    const unit = { id: `stone-${turn}`, owner, x: 1060, y: 355, vx: 0, vy: 0, radius: 29,
      status: 'ready', heroFriction: 1, powerScale: 1, fallPenalty: 0, pendingPulseTriggers: [] };
    world.actor = owner; world.turn = turn; world.launchId = unit.id; world.hasReply = turn < 9;
    world.units.push(unit);
    const profile = owner === 0 ? profileA : profileB;
    const hand = decks[owner].slice(0, 3);
    const enemyHand = decks[1 - owner].slice(0, 3);
    const triggerCandidates = triggerUsed[owner] ? [] : [
      { x: 780, y: 285 }, { x: 650, y: 355 }, { x: 520, y: 425 }, { x: 850, y: 450 }
    ];
    const structureCandidates = world.units.filter(unit => unit.owner !== owner && unit.status !== 'fallen')
      .sort((a, b) => a.x - b.x).slice(0, 2)
      .flatMap(enemy => [82, 145, 210].flatMap(lead => [-54, 0, 54].map(offset => ({
        x: Math.max(120, Math.min(1030, enemy.x + lead)), y: Math.max(100, Math.min(610, enemy.y + offset))
      }))))
      .slice(0, 6);
    const snapshot = { ...world, hand, enemyHand, triggerCandidates, structureCandidates, style: profile.style };
    const result = planner.plan(snapshot, 'hard', { weights: profile.weights, settings: QUICK_SEARCH });
    for (const tactic of result.tactics || []) actions[owner].cards[tactic.card] = (actions[owner].cards[tactic.card] || 0) + 1;
    if (result.trigger) actions[owner].triggers[result.trigger.type] = (actions[owner].triggers[result.trigger.type] || 0) + 1;
    if (result.structure) actions[owner].structures[result.structure.type] = (actions[owner].structures[result.structure.type] || 0) + 1;
    if (result.trigger) {
      world.triggers.push({ ...result.trigger, radius: 14.5,
        range: result.trigger.type === 'pulse' ? 173 : 184,
        impulse: result.trigger.type === 'pulse' ? 370 : undefined });
      triggerUsed[owner] = true;
    }
    const moved = planner.simulate(world, result, 9, result.tactics || []);
    world.units = moved.world.units;
    world.bricks = moved.world.bricks;
    world.triggers = moved.world.triggers;
    world.points = moved.world.points;
    world.mapTime = moved.world.mapTime;
    for (const tactic of result.tactics || []) {
      const index = decks[owner].indexOf(tactic.card);
      if (index >= 0) decks[owner].splice(index, 1);
    }
    world.units.forEach(item => { if (item.status === 'ready') item.status = 'resting'; });
  }
  const totals = planner.score(world);
  return { winner: totals[0] === totals[1] ? -1 : totals[0] > totals[1] ? 0 : 1,
    margin: totals[0] - totals[1], totals, actions,
    map: map.walls ? 'moving-walls' : map.friction < .01 ? 'ice' : 'classic' };
}

function emptyActions() { return { cards: {}, triggers: {}, structures: {} }; }

function runTournament(gamesPerPair = 4) {
  const rows = PROFILES.map(profile => ({ name: profile.name, style: profile.style,
    wins: 0, losses: 0, draws: 0, margin: 0, maps: {}, cards: {}, triggers: {}, structures: {} }));
  const matches = [];
  for (let a = 0; a < PROFILES.length; a += 1) for (let b = a + 1; b < PROFILES.length; b += 1) {
    for (let game = 0; game < gamesPerPair; game += 1) {
      const seed = 8341 + a * 1009 + b * 131 + game * 17;
      const first = playGame(PROFILES[a], PROFILES[b], seed, game % 2);
      const second = playGame(PROFILES[a], PROFILES[b], seed + 1, 1 - (game % 2));
      for (const result of [first, second]) {
        rows[a].margin += result.margin;
        rows[b].margin -= result.margin;
        rows[a].maps[result.map] = (rows[a].maps[result.map] || 0) + 1;
        rows[b].maps[result.map] = (rows[b].maps[result.map] || 0) + 1;
        for (const [index, profileIndex] of [[0, a], [1, b]]) {
          const row = rows[profileIndex];
          for (const [key, count] of Object.entries(result.actions[index].cards)) row.cards[key] = (row.cards[key] || 0) + count;
          for (const [key, count] of Object.entries(result.actions[index].triggers)) row.triggers[key] = (row.triggers[key] || 0) + count;
          for (const [key, count] of Object.entries(result.actions[index].structures)) row.structures[key] = (row.structures[key] || 0) + count;
        }
        if (result.winner < 0) { rows[a].draws += 1; rows[b].draws += 1; }
        else if (result.winner === 0) { rows[a].wins += 1; rows[b].losses += 1; }
        else { rows[b].wins += 1; rows[a].losses += 1; }
        matches.push({ a: PROFILES[a].name, b: PROFILES[b].name, seed: result === first ? seed : seed + 1,
          winner: result.winner < 0 ? 'draw' : result.winner === 0 ? PROFILES[a].name : PROFILES[b].name,
          margin: result.margin, map: result.map });
      }
    }
  }
  rows.sort((a, b) => (b.wins + b.draws * .5) - (a.wins + a.draws * .5) || b.margin - a.margin);
  return { games: matches.length, rows, winner: PROFILES.find(profile => profile.name === rows[0].name), matches };
}

if (require.main === module) {
  const games = Math.max(1, Math.min(40, Number(process.argv[2]) || 1));
  const results = runTournament(games);
  console.log(JSON.stringify({ games: results.games, standings: results.rows,
    recommendedProfile: results.winner.name,
    note: 'Small self-play samples are diagnostic only; do not auto-apply weights without human validation.' }, null, 2));
}

module.exports = { PROFILES, playGame, runTournament };
