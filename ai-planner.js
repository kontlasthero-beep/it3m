(function (root) {
  'use strict';

  const BALANCE = root.UCCAiBalance || (typeof require === 'function' ? require('./ai-balance.js') : null);
  const TABLE = BALANCE?.table || { left: 88, right: 1112, top: 68, bottom: 662, goalX: 108, launchX: 1060 };
  const MOTION = BALANCE?.motion || { unitRadius: 29, launchScale: 5.566, maxPullDistance: 275,
    maxLaunchSpeed: 1392, stopSpeed: 12, restitution: .84, separation: .52 };
  const RESTITUTION = MOTION.restitution;
  const IMPACT_SCALE = MOTION.impactScale ?? .65;
  const STOP_SPEED = MOTION.stopSpeed;
  const STEP = 1 / 120;
  const BLACK_HOLE = BALANCE?.blackhole || { range: 136.5 * 1.25, duration: .85, impulse: 650,
    affectedFrictionMultiplier: .5, triggerRangeMultiplier: 1.35 };
  const PULSE = BALANCE?.pulse || { range: 150.9375, impulse: 274.21875,
    triggerRangeMultiplier: 1.15 * 1.35, triggerImpulseMultiplier: 1.35,
    chargeDelay: .5, friendlyForceMultiplier: .5 };
  const HARDENING = BALANCE?.hardening || { frictionPerStack: 2 };
  const REPULSION = BALANCE?.repulsion || { responseMultiplier: .5, impactMultiplier: 1.5 };
  const BULLET = BALANCE?.bullet || { speedMultiplier: 3, radiusScale: .25, mass: .12,
    targetImpulseScale: 1.72, ricochetSpeedScale: .5 };
  const STRUCTURE = BALANCE?.structure || { width: 18, height: 64, mass: 2, restitution: .58,
    frictionMultiplier: 1.5, barrierFrictionMultiplier: 1 };
  const PLANNER_MODEL_VERSION = 'sc-plan-2026-11-structure-phase-search-10';
  const SETTINGS = {
    easy: { candidates: 132, offsets: [.88, .96, 1.04, 1.12], replyCount: 8, finalists: 5, cardDepth: 1, uncertainty: .035,
      jointSetupSamples: 8, jointReplyCount: 1, setupBeamWidth: 1,
      lookaheadDepth: 0, lookaheadCandidates: 0, lookaheadReplyCount: 0, launchYCandidateCount: 3,
      setupHorizon: 8, replyHorizon: 7, predictionHorizon: 10 },
    normal: { candidates: 240, offsets: [.84, .92, 1, 1.08, 1.16], replyCount: 12, finalists: 8, cardDepth: 2, uncertainty: .008,
      jointSetupSamples: 12, jointReplyCount: 2, setupBeamWidth: 2,
      lookaheadDepth: 1, lookaheadCandidates: 3, lookaheadReplyCount: 2, lookaheadBranches: 1,
      launchYCandidateCount: 6, setupHorizon: 10, replyHorizon: 8, predictionHorizon: 13 },
    hard: { candidates: 560, offsets: [.76, .84, .92, 1, 1.08, 1.16, 1.24], replyCount: 18, finalists: 14, cardDepth: 4, uncertainty: .001,
      jointSetupSamples: 18, jointReplyCount: 2, setupBeamWidth: 3,
      lookaheadDepth: 2, lookaheadCandidates: 3, lookaheadReplyCount: 3, lookaheadBranches: 1,
      launchYCandidateCount: 9, setupHorizon: 12, replyHorizon: 9, predictionHorizon: 16 }
  };
  const DEFAULT_WEIGHTS = { knockout: 1.12, replyRisk: .78, cardCost: 5.5, lookahead: .58 };

  function balanceFingerprint() { return BALANCE?.fingerprint || 'second-chance-balance-unversioned'; }

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const active = unit => unit.status !== 'fallen' && unit.status !== 'ready';
  const phased = (unit, turn) => (unit.ability?.bluffingUntilTurn ?? -1) >= turn;

  function launchXForOwner(world, owner, unit = null) {
    if (Number.isFinite(world.launchXByOwner?.[owner])) return world.launchXByOwner[owner];
    if (!world.duel) return TABLE.launchX;
    const radius = unit?.radius || world.unitRadius || MOTION.unitRadius;
    return owner === 0 ? TABLE.left + radius + 16 : TABLE.launchX;
  }

  function scoreAtX(world, x, owner) {
    if (world.duel) {
      const progress = owner === 0 ? (x - TABLE.left) / (TABLE.right - TABLE.left) :
        (TABLE.right - x) / (TABLE.right - TABLE.left);
      return Math.round(clamp(progress, 0, 1) * 100);
    }
    return Math.round(Math.max(0, 100 * (1 - Math.max(0, x - TABLE.goalX) /
      (TABLE.right - TABLE.goalX))));
  }

  function targetX(world, owner, depth) {
    if (!world.duel) return TABLE.goalX + depth;
    return owner === 0 ? TABLE.right - depth : TABLE.left + depth;
  }

  function cloneWorld(input) {
    return {
      ...input,
      units: input.units.map(unit => ({ ...unit, ability: unit.ability ? {
        ...unit.ability,
        stacks: { ...unit.ability.stacks },
        destroyedGuardSatellites: [...(unit.ability.destroyedGuardSatellites || [])]
      } : null, pendingPulseTriggers: (unit.pendingPulseTriggers || []).map(pulse => ({ ...pulse })) })),
      bricks: input.bricks.map(brick => ({ ...brick })),
      triggers: input.triggers.map(trigger => ({ ...trigger })),
      points: [...input.points],
      mapTime: input.mapTime || 0
    };
  }

  function hardeningMultiplier(unit) {
    const stacks = unit.ability?.stacks?.hardening ?? (unit.ability?.hardening ? 1 : 0);
    const refined = Math.min(stacks, unit.ability?.refinedHardeningStacks || 0);
    return HARDENING.frictionPerStack ** (stacks - refined) * 3 ** refined;
  }

  function friction(world, unit) {
    let multiplier = (unit.frictionMultiplier ?? 1) * hardeningMultiplier(unit);
    if (!phased(unit, world.turn)) for (const brick of world.bricks) {
      if (!(brick.barrier && brick.owner === unit.owner) && Math.abs(unit.x - brick.x) <= brick.width / 2 + unit.radius &&
          Math.abs(unit.y - brick.y) <= brick.height / 2 + unit.radius) multiplier +=
            (brick.frictionMultiplier || STRUCTURE.frictionMultiplier) - 1;
    }
    return world.friction * multiplier * (unit.heroFriction || 1) * (unit.openingFrictionMultiplier || 1) *
      (unit.blackholeFrictionTimer > 0 ? (world.blackholeFrictionMultiplier ||
        BLACK_HOLE.affectedFrictionMultiplier) : 1);
  }

  function score(world) {
    const totals = [...world.points];
    for (const unit of world.units) {
      if (!active(unit)) continue;
      totals[unit.owner] += scoreAtX(world, unit.x, unit.owner);
    }
    return totals;
  }

  // score() already includes the points awarded by fall() for a turn knockout.
  // Adjust from that real award to the requested tactical weight, rather than
  // adding the full award again in each search branch.
  function knockoutTacticalValue(count, world, weight = 1) {
    const bonusWeight = Number.isFinite(weight) ? Math.max(0, weight) : 1;
    return Math.max(0, count) * (world.koPoints || 25) * (bonusWeight - 1);
  }

  function wallSegments(time) {
    const track = (min, max, phase = 0, frequency = .72) => {
      const angle = time * frequency + phase;
      return { value: min + (max - min) * (1 - Math.cos(angle)) / 2,
        velocity: (max - min) * Math.sin(angle) * frequency / 2 };
    };
    const width = 108, height = 18.4, centerX = (TABLE.left + TABLE.right) / 2;
    const leftTrackMax = centerX - 142 - width, rightTrackMin = centerX + 142;
    const lt = track(TABLE.left + 14, leftTrackMax);
    const rt = track(TABLE.right - 14 - width, rightTrackMin, Math.PI);
    const lb = track(TABLE.left + 26, leftTrackMax - 28, Math.PI * .3);
    const rb = track(TABLE.right - 26 - width, rightTrackMin + 28, Math.PI * 1.3);
    const mid = track(TABLE.top + 132, TABLE.bottom - 132 - width, Math.PI / 2, .58);
    return [
      { x: lt.value, y: TABLE.top + 32, width, height, vx: lt.velocity, vy: 0 },
      { x: rt.value, y: TABLE.top + 32, width, height, vx: rt.velocity, vy: 0 },
      { x: lb.value, y: TABLE.bottom - 32 - height, width, height, vx: lb.velocity, vy: 0 },
      { x: rb.value, y: TABLE.bottom - 32 - height, width, height, vx: rb.velocity, vy: 0 },
      { x: centerX - height / 2, y: mid.value, width: height, height: width, vx: 0, vy: mid.velocity }
    ];
  }

  function pulse(world, source, range, impulse, chargedCard = false) {
    for (const target of chargedCard ? world.units : [...world.units, ...world.bricks]) {
      if (target === source || target.barrier || target.status === 'fallen' || target.status === 'ready') continue;
      const dx = target.x - source.x, dy = target.y - source.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range) continue;
      const nx = distance > .001 ? dx / distance : 1;
      const ny = distance > .001 ? dy / distance : 0;
      const teamScale = chargedCard && target.owner === source.owner && !target.width
        ? PULSE.friendlyForceMultiplier : 1;
      target.vx += nx * impulse * teamScale * IMPACT_SCALE;
      target.vy += ny * impulse * teamScale * IMPACT_SCALE;
      if (!target.width) target.status = 'sliding';
    }
    if (chargedCard) world.bricks = world.bricks.filter(brick => Math.hypot(brick.x - source.x, brick.y - source.y) > range);
  }

  function detonateChargedPulse(world, source) {
    if (!source.ability?.pulse || source.status === 'fallen') return false;
    source.ability.pulse = false;
    pulse(world, source, PULSE.range, PULSE.impulse, true);
    return true;
  }

  function blackhole(world, source, range) {
    const duration = world.blackholeDuration || BLACK_HOLE.duration;
    source.fluidTimer = duration;
    for (const target of [...world.units, ...world.bricks]) {
      if (target === source || target.barrier || target.status === 'fallen' || target.status === 'ready') continue;
      const dx = source.x - target.x, dy = source.y - target.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range || distance < .001) continue;
      target.blackholeFrictionTimer = duration;
      const targetFriction = target.width
        ? world.friction * (target.frictionMultiplier || STRUCTURE.frictionMultiplier) *
          (world.blackholeFrictionMultiplier || BLACK_HOLE.affectedFrictionMultiplier)
        : friction(world, target);
      const force = (world.blackholeImpulse || BLACK_HOLE.impulse) *
        (.72 + .28 * (1 - distance / range)) / (1 + targetFriction * 18) * IMPACT_SCALE;
      target.vx += dx / distance * force;
      target.vy += dy / distance * force;
      if (target.status === 'resting') target.status = 'sliding';
    }
  }

  function applyCard(world, card, source) {
    if (!source || source.status === 'fallen') return false;
    source.ability ||= { stacks: {} };
    source.ability.stacks ||= {};
    const ability = source.ability;
    if (card === 'hardening') {
      ability.stacks.hardening = (ability.stacks.hardening || 0) + 1;
    } else if (card === 'guard') {
      if ((ability.stacks.guard || 0) >= 2) return false;
      ability.stacks.guard = (ability.stacks.guard || 0) + 1;
      ability.guard = true;
    } else if (card === 'pulse') {
      if (ability.pulse) return false;
      ability.pulse = true;
    } else if (card === 'bluffing') {
      if (phased(source, world.turn)) return false;
      ability.bluffingUntilTurn = world.turn + 1;
    } else if (card === 'escape') {
      source.status = 'fallen';
      source.vx = source.vy = 0;
      source.removedByEscape = true;
      world.points[source.owner] += 10;
    } else if (card === 'repulsion-field') {
      if (source.width) source.repulsionField = true;
      else ability.repulsionField = true;
    } else if (card === 'blackhole') {
      blackhole(world, source, world.blackholeRange || BLACK_HOLE.range);
    } else return false;
    return true;
  }

  function fall(world, unit) {
    if (unit.status === 'fallen') return;
    unit.status = 'fallen';
    unit.vx = unit.vy = 0;
    world.points[unit.owner] -= unit.fallPenalty || 0;
    if (unit.owner !== world.actor) world.points[world.actor] += world.koPoints || 25;
  }

  function collideStones(world) {
    const units = world.units;
    for (let i = 0; i < units.length; i += 1) for (let j = i + 1; j < units.length; j += 1) {
      const a = units[i], b = units[j];
      if (!active(a) || !active(b) || a.fluidTimer > 0 || b.fluidTimer > 0 ||
          phased(a, world.turn) || phased(b, world.turn)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || .001;
      const minimum = a.radius + b.radius;
      if (distance >= minimum) continue;
      const nx = dx / distance, ny = dy / distance;
      const overlap = minimum - distance;
      a.x -= nx * overlap * MOTION.separation; a.y -= ny * overlap * MOTION.separation;
      b.x += nx * overlap * MOTION.separation; b.y += ny * overlap * MOTION.separation;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        const impulse = -(1 + RESTITUTION) * relative / 2 * IMPACT_SCALE;
        const aRepulsion = Boolean(a.repulsionField || a.ability?.repulsionField);
        const bRepulsion = Boolean(b.repulsionField || b.ability?.repulsionField);
        const aResponse = aRepulsion ? REPULSION.responseMultiplier : 1;
        const bResponse = bRepulsion ? REPULSION.responseMultiplier : 1;
        const aImpact = bRepulsion ? REPULSION.impactMultiplier : 1;
        const bImpact = aRepulsion ? REPULSION.impactMultiplier : 1;
        a.vx -= impulse * nx * aResponse * aImpact;
        a.vy -= impulse * ny * aResponse * aImpact;
        b.vx += impulse * nx * bResponse * bImpact;
        b.vy += impulse * ny * bResponse * bImpact;
        if (a.status === 'resting') a.status = 'sliding';
        if (b.status === 'resting') b.status = 'sliding';
        for (const unit of [a, b]) {
          for (const pending of unit.pendingPulseTriggers || []) pulse(world, unit, pending.range, pending.impulse);
          unit.pendingPulseTriggers = [];
        }
      }
      detonateChargedPulse(world, a);
      detonateChargedPulse(world, b);
    }
  }

  function collideRect(unit, rect, world, moving, brick) {
    if (!active(unit) || phased(unit, world.turn) || (brick && rect.barrier && rect.owner === unit.owner)) return;
    const x = clamp(unit.x, rect.x - rect.width / 2, rect.x + rect.width / 2);
    const y = clamp(unit.y, rect.y - rect.height / 2, rect.y + rect.height / 2);
    let nx = unit.x - x, ny = unit.y - y;
    let distance = Math.hypot(nx, ny);
    if (distance >= unit.radius) return;
    if (distance < .001) {
      const horizontal = rect.width / 2 + unit.radius - Math.abs(unit.x - rect.x);
      const vertical = rect.height / 2 + unit.radius - Math.abs(unit.y - rect.y);
      if (horizontal < vertical) { nx = unit.x < rect.x ? -1 : 1; ny = 0; distance = unit.radius - horizontal; }
      else { nx = 0; ny = unit.y < rect.y ? -1 : 1; distance = unit.radius - vertical; }
    } else { nx /= distance; ny /= distance; }
    const correction = unit.radius - distance;
    const unitShare = brick && !rect.barrier ? (rect.mass || 2) / (1 + (rect.mass || 2)) : 1;
    unit.x += nx * correction * unitShare; unit.y += ny * correction * unitShare;
    if (brick && !rect.barrier) { rect.x -= nx * correction * (1 - unitShare); rect.y -= ny * correction * (1 - unitShare); }
    const toward = (unit.vx - rect.vx) * nx + (unit.vy - rect.vy) * ny;
    if (toward < 0) {
      const impulse = -(1 + (brick ? rect.restitution || STRUCTURE.restitution : RESTITUTION)) * toward /
        (brick && !rect.barrier ? 1 + 1 / (rect.mass || 2) : 1) * IMPACT_SCALE;
      const unitResponse = unit.repulsionField || unit.ability?.repulsionField ? REPULSION.responseMultiplier : 1;
      const brickResponse = rect.repulsionField ? REPULSION.responseMultiplier : 1;
      const unitImpact = unit.repulsionField || unit.ability?.repulsionField ? REPULSION.impactMultiplier : 1;
      const brickImpact = rect.repulsionField ? REPULSION.impactMultiplier : 1;
      unit.vx += impulse * nx * unitResponse * brickImpact;
      unit.vy += impulse * ny * unitResponse * brickImpact;
      if (brick && !rect.barrier) {
        rect.vx -= impulse * nx * brickResponse * unitImpact / (rect.mass || 2);
        rect.vy -= impulse * ny * brickResponse * unitImpact / (rect.mass || 2);
      }
      for (const pending of unit.pendingPulseTriggers || []) pulse(world, unit, pending.range, pending.impulse);
      unit.pendingPulseTriggers = [];
    }
    detonateChargedPulse(world, unit);
    if (unit.status === 'resting' && Math.hypot(unit.vx, unit.vy) > STOP_SPEED) unit.status = 'sliding';
  }

  function collideBricks(world) {
    for (let i = 0; i < world.bricks.length; i += 1) for (let j = i + 1; j < world.bricks.length; j += 1) {
      const a = world.bricks[i], b = world.bricks[j];
      const overlapX = (a.width + b.width) / 2 - Math.abs(b.x - a.x);
      const overlapY = (a.height + b.height) / 2 - Math.abs(b.y - a.y);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const horizontal = overlapX < overlapY;
      const nx = horizontal ? (b.x >= a.x ? 1 : -1) : 0;
      const ny = horizontal ? 0 : (b.y >= a.y ? 1 : -1);
      const overlap = horizontal ? overlapX : overlapY;
      const invA = a.barrier ? 0 : 1 / (a.mass || 2);
      const invB = b.barrier ? 0 : 1 / (b.mass || 2);
      const invTotal = invA + invB;
      if (!invTotal) continue;
      a.x -= nx * overlap * invA / invTotal;
      a.y -= ny * overlap * invA / invTotal;
      b.x += nx * overlap * invB / invTotal;
      b.y += ny * overlap * invB / invTotal;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative >= 0) continue;
      const impulse = -(1 + Math.min(a.restitution || STRUCTURE.restitution,
        b.restitution || STRUCTURE.restitution)) * relative / invTotal * IMPACT_SCALE;
      const aResponse = a.repulsionField ? REPULSION.responseMultiplier : 1;
      const bResponse = b.repulsionField ? REPULSION.responseMultiplier : 1;
      const aImpact = b.repulsionField ? REPULSION.impactMultiplier : 1;
      const bImpact = a.repulsionField ? REPULSION.impactMultiplier : 1;
      a.vx -= impulse * nx * invA * aResponse * aImpact;
      a.vy -= impulse * ny * invA * aResponse * aImpact;
      b.vx += impulse * nx * invB * bResponse * bImpact;
      b.vy += impulse * ny * invB * bResponse * bImpact;
    }
  }

  function collideMovingWalls(world) {
    if (!world.walls) return;
    for (const wall of wallSegments(world.mapTime)) {
      const rect = { ...wall, x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
      for (const unit of world.units) {
        if ((unit.status !== 'sliding' && unit.status !== 'resting') || phased(unit, world.turn)) continue;
        const closestX = clamp(unit.x, wall.x, wall.x + wall.width);
        const closestY = clamp(unit.y, wall.y, wall.y + wall.height);
        let nx = unit.x - closestX, ny = unit.y - closestY;
        const distance = Math.hypot(nx, ny);
        const minimum = unit.radius + (wall.width > wall.height ? wall.height : wall.width) / 2;
        if (distance >= minimum) continue;
        if (distance < .001) {
          if (wall.width > wall.height) { nx = 0; ny = unit.y < rect.y ? -1 : 1; }
          else { nx = unit.x < rect.x ? -1 : 1; ny = 0; }
        } else { nx /= distance; ny /= distance; }
        unit.x += nx * (minimum - distance);
        unit.y += ny * (minimum - distance);
        const relativeNormal = (unit.vx - wall.vx) * nx + (unit.vy - wall.vy) * ny;
        if (relativeNormal < 0) {
          const response = unit.repulsionField || unit.ability?.repulsionField ? REPULSION.responseMultiplier : 1;
          unit.vx -= (1 + RESTITUTION) * relativeNormal * nx * response * IMPACT_SCALE;
          unit.vy -= (1 + RESTITUTION) * relativeNormal * ny * response * IMPACT_SCALE;
        }
        if (unit.status === 'resting' && Math.hypot(unit.vx, unit.vy) > STOP_SPEED) unit.status = 'sliding';
      }
      for (const brick of world.bricks) {
        if (brick.barrier) continue;
        const overlapX = (wall.width + brick.width) / 2 - Math.abs(brick.x - rect.x);
        const overlapY = (wall.height + brick.height) / 2 - Math.abs(brick.y - rect.y);
        if (overlapX <= 0 || overlapY <= 0) continue;
        const horizontal = overlapX < overlapY;
        const nx = horizontal ? (brick.x >= rect.x ? 1 : -1) : 0;
        const ny = horizontal ? 0 : (brick.y >= rect.y ? 1 : -1);
        const overlap = horizontal ? overlapX : overlapY;
        brick.x += nx * overlap;
        brick.y += ny * overlap;
        const relativeNormal = (brick.vx - wall.vx) * nx + (brick.vy - wall.vy) * ny;
        if (relativeNormal < 0) {
          const response = brick.repulsionField ? REPULSION.responseMultiplier : 1;
          brick.vx -= (1 + (brick.restitution || STRUCTURE.restitution)) * relativeNormal * nx * response * IMPACT_SCALE;
          brick.vy -= (1 + (brick.restitution || STRUCTURE.restitution)) * relativeNormal * ny * response * IMPACT_SCALE;
        }
      }
    }
  }

  function rankLaunchLanes(snapshot, settings, weights) {
    const unit = snapshot.units.find(item => item.id === snapshot.launchId);
    if (!unit) return [];
    if (!snapshot.launchYCandidates?.length) return [{ y: unit.y, value: 0 }];
    const candidates = [...new Set(snapshot.launchYCandidates.map(value => Math.round(value)))];
    const limit = Math.max(1, settings.launchYCandidateCount || candidates.length);
    const sampled = candidates.length <= limit ? candidates : Array.from({ length: limit }, (_, index) =>
      candidates[Math.round(index * (candidates.length - 1) / Math.max(1, limit - 1))]);
    const actor = snapshot.actor;
    const base = score(snapshot);
    const enemies = snapshot.units.filter(other => other.owner !== actor && active(other))
      .sort((a, b) => scoreAtX(snapshot, b.x, actor) - scoreAtX(snapshot, a.x, actor)).slice(0, 2);
    const targetXValues = [unit.radius + 25, 150].map(depth => targetX(snapshot, actor, depth));
    const centerY = (TABLE.top + TABLE.bottom) / 2;
    const ranked = [];
    for (const launchY of sampled) {
      const trial = cloneWorld(snapshot);
      const launcher = trial.units.find(item => item.id === trial.launchId);
      if (!launcher) continue;
      launcher.y = launchY;
      const points = targetXValues.map(x => ({ x, y: centerY }));
      for (const enemy of enemies) points.push({ x: enemy.x, y: enemy.y });
      let laneBest = -Infinity;
      for (const point of points) {
        const dx = point.x - launcher.x, dy = point.y - launcher.y;
        const length = Math.hypot(dx, dy) || 1;
        const frictionValue = Math.max(.001, friction(trial, launcher));
        const basePower = length * -60 * Math.log(clamp(1 - frictionValue, .001, .999)) /
          (MOTION.maxPullDistance * MOTION.launchScale * (launcher.powerScale || 1));
        for (const factor of [.9, 1.08]) {
          const shot = { dx: dx / length, dy: dy / length, power: clamp(basePower * factor, .06, 1) };
          const result = simulate(trial, shot, settings.setupHorizon);
          const delta = (result.scores[actor] - result.scores[1 - actor]) -
            (base[actor] - base[1 - actor]);
          const knocked = enemies.filter(enemy => result.world.units.find(item => item.id === enemy.id)?.status === 'fallen').length;
          const value = delta + knockoutTacticalValue(knocked, snapshot, weights.knockout);
          if (value > laneBest) laneBest = value;
        }
      }
      ranked.push({ y: launchY, value: laneBest });
    }
    return ranked.sort((a, b) => b.value - a.value);
  }

  function step(world) {
    world.mapTime += STEP;
    for (const brick of world.bricks) {
      brick.blackholeFrictionTimer = Math.max(0, (brick.blackholeFrictionTimer || 0) - STEP);
      if (brick.barrier) { brick.vx = brick.vy = 0; continue; }
      brick.x += brick.vx * STEP; brick.y += brick.vy * STEP;
      const drag = Math.pow(Math.max(0, 1 - world.friction * (brick.frictionMultiplier || STRUCTURE.frictionMultiplier) *
        (brick.blackholeFrictionTimer > 0 ? (world.blackholeFrictionMultiplier ||
          BLACK_HOLE.affectedFrictionMultiplier) : 1)), STEP * 60);
      brick.vx *= drag; brick.vy *= drag;
      if (Math.hypot(brick.vx, brick.vy) < 5) brick.vx = brick.vy = 0;
      const hw = brick.width / 2, hh = brick.height / 2, bounce = brick.restitution || STRUCTURE.restitution;
      if (brick.x < TABLE.left + hw) { brick.x = TABLE.left + hw; brick.vx = Math.abs(brick.vx) * bounce; }
      if (brick.x > TABLE.right - hw) { brick.x = TABLE.right - hw; brick.vx = -Math.abs(brick.vx) * bounce; }
      if (brick.y < TABLE.top + hh) { brick.y = TABLE.top + hh; brick.vy = Math.abs(brick.vy) * bounce; }
      if (brick.y > TABLE.bottom - hh) { brick.y = TABLE.bottom - hh; brick.vy = -Math.abs(brick.vy) * bounce; }
    }
    for (const unit of world.units) {
      if (unit.status === 'fallen') continue;
      unit.fluidTimer = Math.max(0, (unit.fluidTimer || 0) - STEP);
      unit.blackholeFrictionTimer = Math.max(0, (unit.blackholeFrictionTimer || 0) - STEP);
      const ability = unit.ability;
      if (ability?.guard) ability.guardAngle = (ability.guardAngle || 0) + STEP * 1.6875;
      if (unit.pendingPulseTriggers?.length) {
        for (const pending of unit.pendingPulseTriggers) pending.remaining -= STEP;
        for (const pending of unit.pendingPulseTriggers.filter(item => item.remaining <= 0))
          pulse(world, unit, pending.range, pending.impulse);
        unit.pendingPulseTriggers = unit.pendingPulseTriggers.filter(item => item.remaining > 0);
      }
      if (unit.status !== 'sliding') continue;
      const oldX = unit.x, oldY = unit.y;
      unit.x += unit.vx * STEP; unit.y += unit.vy * STEP;
      const drag = Math.pow(Math.max(0, 1 - friction(world, unit)), STEP * 60);
      unit.vx *= drag; unit.vy *= drag;
      if (Math.hypot(unit.vx, unit.vy) < STOP_SPEED) { unit.vx = unit.vy = 0; unit.status = 'resting'; }
      if (unit.x < TABLE.left || unit.x > TABLE.right ||
          unit.y < TABLE.top || unit.y > TABLE.bottom) { fall(world, unit); continue; }
      for (let index = world.triggers.length - 1; index >= 0; index -= 1) {
        const trigger = world.triggers[index];
        const dx = unit.x - oldX, dy = unit.y - oldY;
        const t = dx * dx + dy * dy ? clamp(((trigger.x - oldX) * dx + (trigger.y - oldY) * dy) /
          (dx * dx + dy * dy), 0, 1) : 0;
        if (Math.hypot(trigger.x - (oldX + dx * t), trigger.y - (oldY + dy * t)) > unit.radius + trigger.radius) continue;
        world.triggers.splice(index, 1);
        if (trigger.type === 'pulse') unit.pendingPulseTriggers.push({ remaining: PULSE.chargeDelay,
          range: trigger.range, impulse: trigger.impulse });
        if (trigger.type === 'blackhole') blackhole(world, unit, trigger.range);
        if (trigger.type === 'hardening') {
          unit.ability ||= { stacks: {} };
          unit.ability.stacks ||= {};
          unit.ability.stacks.hardening = (unit.ability.stacks.hardening || 0) + 1;
        }
        if (trigger.type === 'guard') {
          unit.ability ||= { stacks: {} };
          unit.ability.stacks ||= {};
          unit.ability.stacks.guard = Math.min(2, (unit.ability.stacks.guard || 0) + 1);
          unit.ability.guard = true;
        }
        break;
      }
    }
    // Match the live update order: stone/brick contacts resolve first, then
    // moving rails push loose bricks. The resulting contacts settle next tick.
    collideStones(world);
    for (const unit of world.units) for (const brick of [...world.bricks])
      if (world.bricks.includes(brick)) collideRect(unit, brick, world, true, true);
    collideBricks(world);
    collideMovingWalls(world);
    for (const source of world.units) {
      const ability = source.ability;
      if (!active(source) || !ability?.guard) continue;
      const count = Math.min(2, ability.stacks?.guard || 1) * 2;
      const orbit = source.radius * 1.875, satRadius = source.radius * .35;
      for (let index = 0; index < count; index += 1) {
        if (ability.destroyedGuardSatellites?.includes(index)) continue;
        const angle = (Number.isFinite(ability.guardAngle) ? ability.guardAngle : 0) +
          index * Math.PI * 2 / count;
        const sx = source.x + Math.cos(angle) * orbit, sy = source.y + Math.sin(angle) * orbit;
        const svx = -Math.sin(angle) * orbit * 1.6875, svy = Math.cos(angle) * orbit * 1.6875;
        for (const target of [...world.units, ...world.bricks]) {
          if (target === source || target.barrier || target.status === 'fallen' || target.status === 'ready' ||
              (target.radius && phased(target, world.turn))) continue;
          const isBrick = Boolean(target.width);
          const closestX = isBrick ? clamp(sx, target.x - target.width / 2, target.x + target.width / 2) : target.x;
          const closestY = isBrick ? clamp(sy, target.y - target.height / 2, target.y + target.height / 2) : target.y;
          let dx = closestX - sx, dy = closestY - sy;
          let distance = Math.hypot(dx, dy);
          const minimum = satRadius + (isBrick ? 0 : target.radius);
          if (distance >= minimum) continue;
          if (distance < .001) {
            dx = target.x < sx ? -1 : 1;
            dy = 0;
            distance = 1;
          }
          const nx = dx / distance, ny = dy / distance;
          const overlap = minimum - distance;
          target.x += nx * overlap;
          target.y += ny * overlap;
          const toward = (target.vx - svx) * nx + (target.vy - svy) * ny;
          if (toward < 0) {
            target.vx -= (1 + RESTITUTION) * toward * nx;
            target.vy -= (1 + RESTITUTION) * toward * ny;
          }
          if (target.status === 'resting' && Math.hypot(target.vx, target.vy) > STOP_SPEED) target.status = 'sliding';
        }
      }
    }
    for (const unit of world.units) {
      if (unit.status !== 'fallen' && (unit.x < TABLE.left || unit.x > TABLE.right ||
          unit.y < TABLE.top || unit.y > TABLE.bottom)) fall(world, unit);
    }
  }

  function simulate(snapshot, shot, limit = 8, tactics = []) {
    const world = cloneWorld(snapshot);
    const unit = world.units.find(item => item.id === snapshot.launchId);
    if (!unit) return { world, scores: score(world) };
    if (Number.isFinite(shot.launchY)) unit.y = shot.launchY;
    for (const tactic of tactics) if (tactic.at === 0)
      applyCard(world, tactic.card, world.units.find(item => item.id === (tactic.targetId || unit.id)));
    if (unit.status === 'fallen') return { world, scores: score(world) };
    const speed = clamp(MOTION.maxPullDistance * shot.power * MOTION.launchScale,
      35, MOTION.maxLaunchSpeed) * (unit.powerScale || 1);
    unit.vx = shot.dx * speed; unit.vy = shot.dy * speed;
    unit.status = 'sliding';
    const steps = Math.ceil(limit / STEP);
    for (let index = 0; index < steps; index += 1) {
      for (const tactic of tactics) if (tactic.at > 0 && tactic.at <= index * STEP &&
        tactic.at > (index - 1) * STEP)
        applyCard(world, tactic.card, world.units.find(item => item.id === (tactic.targetId || unit.id)));
      if (unit.status === 'fallen') break;
      step(world);
      // Moving-wall maps remain physically active after every stone and loose
      // structure has come to rest. Stopping here made the planner miss a rail
      // sweeping into a resting stone later in the same prediction window.
      if (!world.walls && index > 4 && !world.units.some(item => item.status === 'sliding') &&
          !world.bricks.some(item => Math.hypot(item.vx, item.vy) > 5)) break;
    }
    return { world, scores: score(world) };
  }

  function ammoCandidates(snapshot, source) {
    const radius = source.radius * BULLET.radiusScale;
    const angles = new Map();
    const add = angle => {
      if (!Number.isFinite(angle)) return;
      const normalized = Math.atan2(Math.sin(angle), Math.cos(angle));
      const key = Math.round(normalized * 500);
      angles.set(key, normalized);
    };
    const aimAt = (x, y, targetRadius = MOTION.unitRadius) => {
      const dx = x - source.x, dy = y - source.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 1 || distance > 1500) return;
      const center = Math.atan2(dy, dx);
      const span = Math.asin(clamp((radius + targetRadius + 2) / distance, 0, .92));
      for (const offset of [-.9, -.55, -.25, 0, .25, .55, .9]) add(center + span * offset);
    };
    for (const unit of snapshot.units) {
      if (unit.id === source.id || unit.status === 'fallen' || unit.status === 'ready' || unit.fluidTimer > 0 ||
          phased(unit, snapshot.turn)) continue;
      aimAt(unit.x, unit.y, unit.radius);
      if (unit.ability?.guard) {
        const count = Math.min(2, unit.ability.stacks?.guard || 1) * 2;
        const orbit = unit.radius * 1.875;
        for (let index = 0; index < count; index += 1) {
          if (unit.ability.destroyedGuardSatellites?.includes(index)) continue;
          const angle = (unit.ability.guardAngle || 0) + index * Math.PI * 2 / count;
          aimAt(unit.x + Math.cos(angle) * orbit, unit.y + Math.sin(angle) * orbit, unit.radius * .35);
        }
      }
    }
    for (const brick of snapshot.bricks || []) {
      const xs = [brick.x, brick.x - brick.width / 2, brick.x + brick.width / 2];
      const ys = [brick.y, brick.y - brick.height / 2, brick.y + brick.height / 2];
      for (const x of xs) for (const y of ys) aimAt(x, y, Math.max(5, Math.min(brick.width, brick.height) / 2));
    }
    if (snapshot.walls) for (const phase of [.08, .2, .38, .62])
      for (const wall of wallSegments((snapshot.mapTime || 0) + phase)) {
        aimAt(wall.x + wall.width / 2, wall.y + wall.height / 2,
          Math.max(wall.width, wall.height) / 2);
      }
    // A modest fallback fan can find a grazing lane when stones or cover
    // obscure the direct target-angle samples.
    for (let index = 0; index < 48; index += 1) add(-Math.PI + index * Math.PI * 2 / 48);
    return [...angles.values()];
  }

  function circleRectContact(x, y, radius, rect) {
    const closestX = clamp(x, rect.x - rect.width / 2, rect.x + rect.width / 2);
    const closestY = clamp(y, rect.y - rect.height / 2, rect.y + rect.height / 2);
    let nx = x - closestX, ny = y - closestY;
    let distance = Math.hypot(nx, ny);
    if (distance >= radius) return null;
    let surfaceX = closestX, surfaceY = closestY;
    if (distance < .001) {
      const edges = [
        { d: Math.abs(x - (rect.x - rect.width / 2)), nx: -1, ny: 0, sx: rect.x - rect.width / 2, sy: y },
        { d: Math.abs(rect.x + rect.width / 2 - x), nx: 1, ny: 0, sx: rect.x + rect.width / 2, sy: y },
        { d: Math.abs(y - (rect.y - rect.height / 2)), nx: 0, ny: -1, sx: x, sy: rect.y - rect.height / 2 },
        { d: Math.abs(rect.y + rect.height / 2 - y), nx: 0, ny: 1, sx: x, sy: rect.y + rect.height / 2 }
      ].sort((a, b) => a.d - b.d);
      ({ nx, ny, sx: surfaceX, sy: surfaceY } = edges[0]);
    } else { nx /= distance; ny /= distance; }
    return { nx, ny, surfaceX, surfaceY };
  }

  function simulateAmmo(snapshot, angle, flightLimit = 1.6, settleLimit = 4.5) {
    const world = cloneWorld(snapshot);
    const source = world.units.find(unit => unit.id === snapshot.launchId);
    if (!source) return { world, hit: null, destroyedBricks: [] };
    const speed = (snapshot.maxLaunchSpeed || MOTION.maxLaunchSpeed) * BULLET.speedMultiplier;
    const bullet = { x: source.x, y: source.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: source.radius * BULLET.radiusScale, mass: BULLET.mass, sourceUnitId: source.id,
      outsideTime: 0, active: true };
    let hit = null;
    const destroyedBricks = [];
    const removeBullet = () => { bullet.active = false; };
    const reflect = (target, contact) => {
      const incoming = bullet.vx * contact.nx + bullet.vy * contact.ny;
      const closing = Math.max(0, -((bullet.vx - (target.vx || 0)) * contact.nx +
        (bullet.vy - (target.vy || 0)) * contact.ny));
      bullet.vx = (bullet.vx - 2 * incoming * contact.nx) * BULLET.ricochetSpeedScale;
      bullet.vy = (bullet.vy - 2 * incoming * contact.ny) * BULLET.ricochetSpeedScale;
      bullet.x = contact.surfaceX + contact.nx * (bullet.radius + 1);
      bullet.y = contact.surfaceY + contact.ny * (bullet.radius + 1);
      bullet.sourceUnitId = target.id;
      bullet.outsideTime = 0;
      if (closing > 0) {
        const impulse = BULLET.targetImpulseScale * closing / (1 + 1 / bullet.mass) * IMPACT_SCALE;
        const protectedTarget = Boolean(target.repulsionField || target.ability?.repulsionField);
        const response = protectedTarget ? REPULSION.responseMultiplier : 1;
        target.vx = (target.vx || 0) - contact.nx * impulse * response;
        target.vy = (target.vy || 0) - contact.ny * impulse * response;
        if (!target.width && Math.hypot(target.vx, target.vy) > STOP_SPEED) target.status = 'sliding';
        if (!target.width) {
          for (const pending of target.pendingPulseTriggers || []) pulse(world, target, pending.range, pending.impulse);
          target.pendingPulseTriggers = [];
          detonateChargedPulse(world, target);
        }
      }
      hit ||= { type: 'ricochet', targetId: target.id };
    };
    const flightSteps = Math.ceil(flightLimit / STEP);
    for (let frame = 0; frame < flightSteps && bullet.active; frame += 1) {
      step(world);
      const substeps = Math.max(1, Math.ceil(Math.hypot(bullet.vx, bullet.vy) * STEP / Math.max(4, bullet.radius)));
      let stoppedThisFrame = false;
      for (let sub = 0; sub < substeps && bullet.active && !stoppedThisFrame; sub += 1) {
        const subDt = STEP / substeps;
        bullet.x += bullet.vx * subDt;
        bullet.y += bullet.vy * subDt;
        const outside = bullet.x < TABLE.left || bullet.x > TABLE.right || bullet.y < TABLE.top || bullet.y > TABLE.bottom;
        bullet.outsideTime = outside ? bullet.outsideTime + subDt : 0;
        if (bullet.outsideTime >= 1) { removeBullet(); break; }
        if (world.walls) for (const wall of wallSegments(world.mapTime)) {
          const rect = { x: wall.x + wall.width / 2, y: wall.y + wall.height / 2,
            width: wall.width, height: wall.height };
          const contact = circleRectContact(bullet.x, bullet.y, bullet.radius, rect);
          if (!contact) continue;
          const relative = (bullet.vx - wall.vx) * contact.nx + (bullet.vy - wall.vy) * contact.ny;
          if (relative < 0) {
            bullet.x += contact.nx * (bullet.radius + 1);
            bullet.y += contact.ny * (bullet.radius + 1);
            bullet.vx -= 1.82 * relative * contact.nx;
            bullet.vy -= 1.82 * relative * contact.ny;
            hit ||= { type: 'rail', targetId: null };
            stoppedThisFrame = true;
            break;
          }
        }
        if (!bullet.active || stoppedThisFrame) continue;
        let intercepted = false;
        for (const guard of world.units) {
          if (!guard.ability?.guard || guard.status === 'fallen') continue;
          const count = Math.min(2, guard.ability.stacks?.guard || 1) * 2;
          const orbit = guard.radius * 1.875, satRadius = guard.radius * .35;
          for (let satellite = 0; satellite < count; satellite += 1) {
            if (guard.ability.destroyedGuardSatellites?.includes(satellite)) continue;
            const satAngle = (guard.ability.guardAngle || 0) + satellite * Math.PI * 2 / count;
            const sx = guard.x + Math.cos(satAngle) * orbit, sy = guard.y + Math.sin(satAngle) * orbit;
            if (Math.hypot(bullet.x - sx, bullet.y - sy) >= bullet.radius + satRadius) continue;
            (guard.ability.destroyedGuardSatellites ||= []).push(satellite);
            hit ||= { type: 'guard', targetId: guard.id };
            removeBullet(); intercepted = true; break;
          }
          if (intercepted) break;
        }
        if (intercepted) break;
        for (let index = world.bricks.length - 1; index >= 0; index -= 1) {
          const brick = world.bricks[index];
          const contact = circleRectContact(bullet.x, bullet.y, bullet.radius, brick);
          if (!contact) continue;
          if (brick.repulsionField) {
            reflect(brick, contact);
            stoppedThisFrame = true;
          } else {
            destroyedBricks.push({ owner: brick.owner, x: brick.x, y: brick.y, barrier: brick.barrier });
            hit ||= { type: 'structure', targetId: brick.id || null };
            world.bricks.splice(index, 1);
            removeBullet();
          }
          break;
        }
        if (!bullet.active || stoppedThisFrame) continue;
        for (const target of world.units) {
          if (target.id === bullet.sourceUnitId || target.status === 'fallen' || target.fluidTimer > 0 ||
              phased(target, world.turn)) continue;
          const dx = target.x - bullet.x, dy = target.y - bullet.y;
          const distance = Math.hypot(dx, dy);
          if (distance >= bullet.radius + target.radius) continue;
          const nx = distance > .001 ? dx / distance : 1;
          const ny = distance > .001 ? dy / distance : 0;
          if (target.repulsionField || target.ability?.repulsionField) {
            const normalX = distance > .001 ? -nx : -1;
            const normalY = distance > .001 ? -ny : 0;
            reflect(target, { nx: normalX, ny: normalY,
              surfaceX: target.x + normalX * target.radius, surfaceY: target.y + normalY * target.radius });
            stoppedThisFrame = true;
          } else {
            const relative = (target.vx - bullet.vx) * nx + (target.vy - bullet.vy) * ny;
            if (target.ability?.pulse) detonateChargedPulse(world, target);
            else if (relative < 0) {
              const impulse = BULLET.targetImpulseScale * -relative / (1 + 1 / bullet.mass) * IMPACT_SCALE;
              target.vx += impulse * nx;
              target.vy += impulse * ny;
              if (Math.hypot(target.vx, target.vy) > STOP_SPEED) target.status = 'sliding';
            }
            hit ||= { type: target.ability?.pulse ? 'pulse' : 'stone', targetId: target.id };
            removeBullet();
          }
          break;
        }
      }
    }
    const settleSteps = Math.ceil(settleLimit / STEP);
    for (let index = 0; index < settleSteps; index += 1) step(world);
    return { world, hit, destroyedBricks };
  }

  function planAmmo(snapshot, difficulty = 'normal') {
    if ((snapshot.prelaunchDelaySeconds || 0) > 0) {
      snapshot = cloneWorld(snapshot);
      const delaySteps = Math.ceil(snapshot.prelaunchDelaySeconds / STEP);
      for (let index = 0; index < delaySteps; index += 1) step(snapshot);
      snapshot.prelaunchDelaySeconds = 0;
    }
    const source = snapshot.units.find(unit => unit.id === snapshot.launchId);
    if (!source || source.status === 'fallen' || source.status === 'ready' || source.activeSpecial) return null;
    const actor = snapshot.actor;
    const baseline = score(snapshot);
    const enemyBefore = snapshot.units.filter(unit => unit.owner !== actor && active(unit)).length;
    const candidates = ammoCandidates(snapshot, source);
    const maxCandidates = difficulty === 'hard' ? 180 : difficulty === 'easy' ? 96 : 132;
    const selected = candidates.length > maxCandidates
      ? Array.from({ length: maxCandidates }, (_, index) => candidates[Math.round(index * (candidates.length - 1) /
        Math.max(1, maxCandidates - 1))]) : candidates;
    let best = null;
    for (const angle of selected) {
      const result = simulateAmmo(snapshot, angle);
      if (!result.hit) continue;
      const totals = score(result.world);
      const delta = (totals[actor] - totals[1 - actor]) - (baseline[actor] - baseline[1 - actor]);
      const enemyAfter = result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
      const ownBefore = snapshot.units.filter(unit => unit.owner === actor && active(unit)).length;
      const ownAfter = result.world.units.filter(unit => unit.owner === actor && active(unit)).length;
      const knockouts = enemyBefore - enemyAfter;
      const ownKnockouts = ownBefore - ownAfter;
      const structureValue = result.destroyedBricks.reduce((sum, brick) =>
        sum + (brick.owner === actor ? -7 : 5) + (brick.barrier ? 2 : 0), 0);
      const value = delta + knockoutTacticalValue(knockouts, snapshot, 1.15) -
        ownKnockouts * (snapshot.koPoints || 25) * 1.25 + structureValue;
      if (!best || value > best.value) best = { angle, value, hit: result.hit, knockouts,
        destroyedStructures: result.destroyedBricks.length, outcome: result.world };
    }
    if (!best) return { dx: 1, dy: 0, value: -Infinity, hit: null, evaluated: selected.length };
    return { dx: Math.cos(best.angle), dy: Math.sin(best.angle), power: 1,
      value: best.value, hit: best.hit, knockouts: best.knockouts,
      destroyedStructures: best.destroyedStructures, evaluated: selected.length,
      searchStats: { ammoDirections: selected.length, selectedHit: best.hit.type },
      plannedMapTime: snapshot.mapTime || 0, balanceFingerprint: balanceFingerprint(),
      balanceCompatible: !snapshot.balanceFingerprint || snapshot.balanceFingerprint === balanceFingerprint() };
  }

  function bankAimPoint(source, target, rect) {
    const left = rect.x, right = rect.x + rect.width;
    const top = rect.y, bottom = rect.y + rect.height;
    const faces = [
      { axis: 'x', edge: left, sourceSide: source.x < left, targetSide: target.x < left },
      { axis: 'x', edge: right, sourceSide: source.x > right, targetSide: target.x > right },
      { axis: 'y', edge: top, sourceSide: source.y < top, targetSide: target.y < top },
      { axis: 'y', edge: bottom, sourceSide: source.y > bottom, targetSide: target.y > bottom }
    ];
    for (const face of faces) {
      if (!face.sourceSide || !face.targetSide) continue;
      const mirrored = face.axis === 'x'
        ? { x: face.edge * 2 - target.x, y: target.y }
        : { x: target.x, y: face.edge * 2 - target.y };
      const denominator = face.axis === 'x' ? mirrored.x - source.x : mirrored.y - source.y;
      if (Math.abs(denominator) < .001) continue;
      const t = (face.edge - (face.axis === 'x' ? source.x : source.y)) / denominator;
      if (t <= 0 || t >= 1) continue;
      const cross = face.axis === 'x'
        ? source.y + (mirrored.y - source.y) * t
        : source.x + (mirrored.x - source.x) * t;
      if (face.axis === 'x' ? cross < top || cross > bottom : cross < left || cross > right) continue;
      return mirrored;
    }
    return null;
  }

  function structuralBankTargets(snapshot, unit, limit = 14) {
    const centerY = (TABLE.top + TABLE.bottom) / 2;
    const targets = [
      { x: targetX(snapshot, unit.owner, unit.radius + 28), y: centerY },
      { x: targetX(snapshot, unit.owner, 132), y: TABLE.top + unit.radius + 46 },
      { x: targetX(snapshot, unit.owner, 132), y: TABLE.bottom - unit.radius - 46 }
    ];
    const opponents = snapshot.units.filter(other => other.id !== unit.id && other.owner !== unit.owner && active(other))
      .sort((a, b) => scoreAtX(snapshot, b.x, unit.owner) - scoreAtX(snapshot, a.x, unit.owner));
    for (const enemy of opponents.slice(0, 2)) targets.push({ x: enemy.x, y: enemy.y });
    const ownLead = snapshot.units.filter(other => other.id !== unit.id && other.owner === unit.owner && active(other))
      .sort((a, b) => scoreAtX(snapshot, b.x, unit.owner) - scoreAtX(snapshot, a.x, unit.owner))[0];
    if (ownLead) targets.push({ x: ownLead.x, y: ownLead.y });

    // Sample every rail across the likely flight window. Previously the small
    // global limit was consumed by the first few rails/phases, so some moving
    // structures never contributed a bank route at all.
    const phases = [.3, .7, 1.1, 1.5, 1.9, 2.3];
    const groups = new Map();
    const addObstacle = (obstacle, groupId) => {
      if (!groups.has(groupId)) groups.set(groupId, []);
      const bucket = groups.get(groupId);
      for (const target of targets) {
        const radius = unit.radius || MOTION.unitRadius;
        const collisionRect = { ...obstacle, x: obstacle.x - radius, y: obstacle.y - radius,
          width: obstacle.width + radius * 2, height: obstacle.height + radius * 2 };
        const point = bankAimPoint(unit, target, collisionRect);
        if (!point || point.x < TABLE.left - 30 || point.x > TABLE.right + 30 ||
            point.y < TABLE.top - 30 || point.y > TABLE.bottom + 30) continue;
        const key = `${Math.round(point.x / 18)}:${Math.round(point.y / 18)}`;
        if (bucket.some(item => item.key === key)) continue;
        bucket.push({ key, point });
      }
    };
    if (snapshot.walls) for (const [phaseIndex, eta] of phases.entries()) {
      const rails = wallSegments((snapshot.mapTime || 0) + eta);
      rails.forEach((wall, railIndex) => addObstacle(wall, `rail-${railIndex}-phase-${phaseIndex}`));
    }
    for (const [brickIndex, brick] of (snapshot.bricks || []).entries()) {
      if (brick.barrier && brick.owner === unit.owner) continue;
      const eta = .55;
      const drag = Math.pow(Math.max(0, 1 - snapshot.friction * (brick.frictionMultiplier || STRUCTURE.frictionMultiplier)), eta * 60);
      const centerX = brick.x + (brick.vx || 0) * eta * (1 + drag) / 2;
      const centerY = brick.y + (brick.vy || 0) * eta * (1 + drag) / 2;
      // Brick positions are centers in the physics model; bankAimPoint expects a top-left rect.
      addObstacle({ ...brick, x: centerX - brick.width / 2, y: centerY - brick.height / 2 }, `brick-${brickIndex}`);
    }
    // Round-robin by rail phase, then include loose structures. This preserves
    // routes from every rail throughout the likely flight window while keeping
    // existing bricks represented in the same bounded candidate set.
    const entries = [...groups.entries()];
    const railBuckets = entries.filter(([id]) => id.startsWith('rail-')).map(([, bucket]) => bucket);
    const brickBuckets = entries.filter(([id]) => id.startsWith('brick-')).map(([, bucket]) => bucket);
    const banked = [];
    for (let rank = 0; banked.length < limit; rank += 1) {
      let added = false;
      for (const bucket of [...railBuckets, ...brickBuckets]) {
        if (bucket[rank]) {
          banked.push(bucket[rank].point);
          added = true;
          if (banked.length >= limit) break;
        }
      }
      if (!added) break;
    }
    return banked;
  }

  function candidates(snapshot, count, offsets, options = {}) {
    const unit = snapshot.units.find(item => item.id === snapshot.launchId);
    const targets = [];
    const random = (() => {
      let seed = ((snapshot.seed || 1) >>> 0) || 1;
      return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    })();
    const ySpan = TABLE.bottom - TABLE.top - unit.radius * 2 - 36;
    for (let index = 0; index < Math.ceil(count / offsets.length); index += 1) {
      const lane = (index + .35 + random() * .3) / Math.ceil(count / offsets.length);
      targets.push({ x: targetX(snapshot, unit.owner, unit.radius + 25 + random() * 260),
        y: TABLE.top + unit.radius + 18 + ySpan * lane });
    }
    if (snapshot.duel) {
      // Always sample the opponent-side scoring edge in a Duel, in the correct
      // owner-specific direction; the seeded broad samples alone could miss it.
      const edgeX = targetX(snapshot, unit.owner, unit.radius + 2);
      const centerY = (TABLE.top + TABLE.bottom) / 2;
      for (const yOffset of [0, -unit.radius * 1.25, unit.radius * 1.25])
        targets.push({ x: edgeX, y: clamp(centerY + yOffset, TABLE.top + unit.radius, TABLE.bottom - unit.radius) });
    }
    for (const other of snapshot.units) {
      if (other.id === unit.id || !active(other)) continue;
      for (const dy of [0, -other.radius * .7, other.radius * .7])
        targets.push({ x: other.x + (random() - .5) * 22, y: other.y + dy });
      if (other.owner !== unit.owner && other.ability?.guard) {
        const orbit = other.radius * 1.875;
        for (let index = 0; index < 8; index += 1) {
          const angle = index * Math.PI / 4;
          targets.push({ x: other.x + Math.cos(angle) * orbit, y: other.y + Math.sin(angle) * orbit });
        }
      }
    }
    if (snapshot.triggers.length) for (const trigger of snapshot.triggers)
      targets.push({ x: trigger.x, y: trigger.y });
    if (options.bankShots && (snapshot.walls || snapshot.bricks?.length))
      targets.push(...structuralBankTargets(snapshot, unit, options.maxBankTargets || 14)
        .map(point => ({ ...point, bankShot: true })));
    const shots = [];
    for (const target of targets) {
      const dx = target.x - unit.x, dy = target.y - unit.y;
      const distance = Math.hypot(dx, dy) || 1;
      const travel = distance * -60 * Math.log(clamp(1 - snapshot.friction * (unit.heroFriction || 1) *
        (unit.openingFrictionMultiplier || 1) * (unit.frictionMultiplier ?? 1) * hardeningMultiplier(unit), .001, .999));
      const basePower = travel / (MOTION.maxPullDistance * MOTION.launchScale * (unit.powerScale || 1));
      for (const offset of offsets) shots.push({ dx: dx / distance, dy: dy / distance,
        power: clamp(basePower * offset, .06, 1), bankShot: Boolean(target.bankShot) });
    }
    return shots;
  }

  function replyRisk(world, actor, count, enemyHand = [], useCards = false, horizon = 11) {
    if (!count || !world.units.some(unit => unit.owner === actor && active(unit))) return 0;
    const enemy = 1 - actor;
    const reply = cloneWorld(world);
    reply.actor = enemy;
    reply.turn += 1;
    reply.bricks = reply.bricks.filter(brick => !brick.barrier || brick.expiresAtTurn == null ||
      brick.expiresAtTurn > reply.turn);
    reply.launchId = 'reply';
    reply.koPoints = world.replyKoPoints || 25;
    reply.units.push({ id: 'reply', owner: enemy, x: launchXForOwner(reply, enemy), y: 365,
      radius: world.replyStone?.radius || MOTION.unitRadius, status: 'ready', vx: 0, vy: 0,
      heroFriction: world.replyStone?.heroFriction || 1,
      powerScale: world.replyStone?.powerScale || 1,
      fallPenalty: world.replyStone?.fallPenalty || 0,
      pendingPulseTriggers: [] });
    const targets = world.units.filter(unit => unit.owner === actor && active(unit))
      .sort((a, b) => scoreAtX(world, b.x, actor) - scoreAtX(world, a.x, actor)).slice(0, 3);
    const before = score(world);
    const replies = [];
    const cards = useCards ? [...new Set(enemyHand)].filter(id =>
      ['blackhole', 'pulse', 'bluffing', 'guard', 'hardening', 'escape', 'repulsion-field'].includes(id)) : [];
    const oldEnemy = world.units.filter(unit => unit.owner === enemy && active(unit))
      .sort((a, b) => scoreAtX(world, b.x, enemy) - scoreAtX(world, a.x, enemy))[0];
    const replyX = launchXForOwner(reply, enemy, reply.units.at(-1));
    const replyRadius = reply.replyStone?.radius || MOTION.unitRadius;
    const replyWalls = reply.walls ? wallSegments(reply.mapTime) : [];
    const legalReplyY = y => {
      if (y < TABLE.top + replyRadius || y > TABLE.bottom - replyRadius) return false;
      if (reply.units.some(unit => unit.id !== 'reply' && unit.status !== 'fallen' &&
          Math.hypot(unit.x - replyX, unit.y - y) < unit.radius + replyRadius + 2)) return false;
      if (reply.bricks.some(brick => Math.abs(brick.x - replyX) < brick.width / 2 + replyRadius &&
          Math.abs(brick.y - y) < brick.height / 2 + replyRadius)) return false;
      return !replyWalls.some(wall => replyX + replyRadius > wall.x && replyX - replyRadius < wall.x + wall.width &&
        y + replyRadius > wall.y && y - replyRadius < wall.y + wall.height);
    };
    const replyYValues = target => [...new Set([365, target.y,
      target.y - target.radius * 1.4, target.y + target.radius * 1.4]
      .map(y => Math.round(clamp(y, TABLE.top + replyRadius, TABLE.bottom - replyRadius))))]
      .filter(legalReplyY);
    for (const target of targets) for (const launchY of replyYValues(target))
      for (const lateral of [0, -target.radius * .6, target.radius * .6]) {
      const replyUnit = reply.units.at(-1);
      const dx = target.x - replyUnit.x, dy = target.y + lateral - launchY;
      const length = Math.hypot(dx, dy) || 1;
      const base = length * -60 * Math.log(clamp(1 - reply.friction *
        (reply.units.at(-1).heroFriction || 1), .001, .999)) /
        (MOTION.maxPullDistance * MOTION.launchScale * (reply.units.at(-1).powerScale || 1));
      for (const offset of [.9, 1.1]) replies.push({ dx: dx / length, dy: dy / length, launchY,
        power: clamp(base * offset, .1, 1) });
    }
    const sampled = replies.filter((_, index) => index % Math.max(1, Math.ceil(replies.length / count)) === 0)
      .slice(0, count);
    const evaluatedReplies = [];
    for (const shot of sampled) {
      let bestValue = -Infinity, bestWorld = null;
      const variants = [[], ...cards.map(card => [{ card, at: card === 'blackhole' ? 1 : 0 }])];
      if (oldEnemy) for (const card of cards)
        if (['blackhole', 'guard', 'hardening', 'escape', 'repulsion-field'].includes(card))
          variants.push([{ card, at: 0, targetId: oldEnemy.id }]);
      for (const tactics of variants) {
        const replyState = cloneWorld(reply);
        replyState.units.find(unit => unit.id === 'reply').y = shot.launchY;
        const result = simulate(replyState, shot, horizon, tactics);
        const gain = (result.scores[enemy] - result.scores[actor]) - (before[enemy] - before[actor]);
        // The simulated score already includes the turn knockout award.
        if (gain > bestValue) { bestValue = gain; bestWorld = result.world; }
      }
      const repositionPressure = useCards && enemyHand.includes('reposition')
        ? (targets.some(unit => scoreAtX(world, unit.x, actor) >= 75) ? 6 : 2) : 0;
      evaluatedReplies.push({ value: Math.max(0, bestValue) + repositionPressure, world: bestWorld });
    }
    if (useCards && enemyHand.includes('ammo')) {
      // Evaluate the bullet only after the opponent's candidate shot has settled;
      // that shot may move the target, intercept a bullet, or alter a rail lane.
      const ammoReplies = [...evaluatedReplies].sort((a, b) => b.value - a.value).slice(0, 2);
      for (const candidate of ammoReplies) {
        if (!candidate.world) continue;
        const ammoTarget = candidate.world.units.filter(unit => unit.owner === actor && active(unit))
          .sort((a, b) => scoreAtX(candidate.world, b.x, actor) - scoreAtX(candidate.world, a.x, actor))[0];
        if (!ammoTarget) continue;
        const ammoSources = candidate.world.units.filter(unit => unit.owner === enemy && unit.status === 'resting' &&
          !unit.activeSpecial && !unit.relaunchUsed)
          .sort((a, b) => Math.hypot(a.x - ammoTarget.x, a.y - ammoTarget.y) -
            Math.hypot(b.x - ammoTarget.x, b.y - ammoTarget.y));
        const ammoSource = ammoSources[0];
        if (!ammoSource) continue;
        const afterShot = score(candidate.world);
        const baseAngle = Math.atan2(ammoTarget.y - ammoSource.y, ammoTarget.x - ammoSource.x);
        let ammoGain = 0;
        for (const offset of [0, -.12, .12]) {
          const ammoWorld = cloneWorld(candidate.world);
          ammoWorld.actor = enemy;
          ammoWorld.launchId = ammoSource.id;
          const ammoResult = simulateAmmo(ammoWorld, baseAngle + offset, 1.6, Math.min(horizon, 2.2));
          if (!ammoResult.hit) continue;
          const afterAmmo = score(ammoResult.world);
          const delta = (afterAmmo[enemy] - afterAmmo[actor]) -
            (afterShot[enemy] - afterShot[actor]);
          const structureValue = ammoResult.destroyedBricks.reduce((sum, brick) =>
            sum + (brick.owner === enemy ? -7 : 5) + (brick.barrier ? 2 : 0), 0);
          ammoGain = Math.max(ammoGain, delta + structureValue);
        }
        candidate.value += Math.max(0, ammoGain);
      }
    }
    const values = evaluatedReplies.map(candidate => candidate.value);
    values.sort((a, b) => b - a);
    return (values[0] || 0) * .55 + (values[1] || 0) * .3 +
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) * .15;
  }

  function rankTriggerOptions(snapshot, settings, weights, enemyHand, useCards) {
    if (!snapshot.triggerCandidates?.length) return [];
    const launcher = snapshot.units.find(unit => unit.id === snapshot.launchId);
    if (!launcher) return [];
    const probes = [365, 255, 475].map(y => {
      const dx = targetX(snapshot, snapshot.actor, 130) - launcher.x, dy = y - launcher.y;
      const length = Math.hypot(dx, dy) || 1;
      const power = clamp(length * -60 * Math.log(clamp(1 - snapshot.friction *
        (launcher.heroFriction || 1), .001, .999)) /
        (MOTION.maxPullDistance * MOTION.launchScale * (launcher.powerScale || 1)), .1, 1);
      return { dx: dx / length, dy: dy / length, power };
    });
    const evaluate = world => {
      const base = score(snapshot);
      const enemiesBefore = snapshot.units.filter(unit => unit.owner !== snapshot.actor && active(unit)).length;
      let best = -Infinity;
      for (const shot of probes) {
        const result = simulate(world, shot, settings.setupHorizon);
        const immediate = (result.scores[snapshot.actor] - result.scores[1 - snapshot.actor]) -
          (base[snapshot.actor] - base[1 - snapshot.actor]);
        const enemiesAfter = result.world.units.filter(unit => unit.owner !== snapshot.actor && active(unit)).length;
        const risk = snapshot.hasReply === false ? 0 : replyRisk(result.world, snapshot.actor,
          Math.min(3, settings.replyCount), enemyHand, useCards, settings.replyHorizon);
        best = Math.max(best, immediate + knockoutTacticalValue(enemiesBefore - enemiesAfter, snapshot,
          weights.knockout) - risk * .5);
      }
      return best;
    };
    const baseline = evaluate(snapshot);
    const options = [];
    for (const candidate of snapshot.triggerCandidates.slice(0, 8)) for (const type of ['guard', 'hardening', 'pulse', 'blackhole']) {
      const trial = cloneWorld(snapshot);
      trial.triggers.push({ ...candidate, type, radius: MOTION.unitRadius * .5,
        range: type === 'pulse' ? (snapshot.pulseRange || PULSE.range) *
          (snapshot.pulseTriggerRangeMultiplier || PULSE.triggerRangeMultiplier) :
          (snapshot.blackholeRange || BLACK_HOLE.range) *
            (snapshot.blackholeTriggerRangeMultiplier || BLACK_HOLE.triggerRangeMultiplier),
        impulse: type === 'pulse' ? (snapshot.pulseImpulse || PULSE.impulse) *
          (snapshot.pulseTriggerImpulseMultiplier || PULSE.triggerImpulseMultiplier) : undefined });
      const value = evaluate(trial);
      if (value > baseline + 5) options.push({ trigger: trial.triggers.at(-1), value: value - baseline });
    }
    const bestByType = new Map();
    for (const option of options) if (!bestByType.has(option.trigger.type) ||
        option.value > bestByType.get(option.trigger.type).value)
      bestByType.set(option.trigger.type, option);
    return [...bestByType.values()].sort((a, b) => b.value - a.value).slice(0, 4);
  }

  function lookahead(world, actor, difficulty, depth, options, spent = []) {
    if (depth <= 0) return 0;
    const future = cloneWorld(world);
    const priorLaunch = future.units.find(unit => unit.id === future.launchId);
    const id = `lookahead-${actor}-${future.turn}-${depth}`;
    future.actor = actor;
    future.turn += 2;
    future.bricks = future.bricks.filter(brick => !brick.barrier || brick.expiresAtTurn == null ||
      brick.expiresAtTurn > future.turn);
    future.launchId = id;
    future.units.push({ id, owner: actor, x: launchXForOwner(future, actor), y: 365, vx: 0, vy: 0,
      radius: priorLaunch?.radius || MOTION.unitRadius, status: 'ready', heroFriction: priorLaunch?.heroFriction || 1,
      powerScale: priorLaunch?.powerScale || 1, fallPenalty: priorLaunch?.fallPenalty || 0,
      pendingPulseTriggers: [] });
    const settings = options.settings;
    const offsets = difficulty === 'hard' ? [.88, 1, 1.12] : [.92, 1.08];
    const candidateShots = candidates(future, settings.lookaheadCandidates, offsets, {
      bankShots: future.walls || future.bricks.length > 0, maxBankTargets: difficulty === 'hard' ? 8 : 4
    });
    const baseline = score(future);
    const available = (options.hand || []).filter(card => !spent.includes(card));
    const cardOrder = ['blackhole', 'pulse', 'guard', 'hardening', 'bluffing'];
    const cards = available.sort((a, b) => cardOrder.indexOf(a) - cardOrder.indexOf(b))
      .slice(0, difficulty === 'hard' ? 3 : 2);
    const targets = future.units.filter(unit => unit.owner === actor && active(unit) && unit.id !== id)
      .sort((a, b) => scoreAtX(future, b.x, actor) - scoreAtX(future, a.x, actor)).slice(0, 2);
    let best = 0;
    const branches = [];
    const stride = Math.max(1, Math.ceil(candidateShots.length / settings.lookaheadCandidates));
    for (let index = 0; index < candidateShots.length; index += stride) {
      const shot = candidateShots[index];
      const variants = [[]];
      for (const card of cards) {
        if (card === 'blackhole') variants.push([{ card, at: .7 }], [{ card, at: 1 }]);
        else if (card === 'pulse' || card === 'bluffing') variants.push([{ card, at: 0 }]);
        else if (card === 'guard' || card === 'hardening') {
          const target = targets[0] || future.units.find(unit => unit.id === id);
          variants.push([{ card, at: 0, targetId: target.id }]);
        }
      }
      for (const tactics of variants) {
        const result = simulate(future, shot, settings.predictionHorizon, tactics);
        const nextScore = result.scores[actor] - result.scores[1 - actor];
        const baseScore = baseline[actor] - baseline[1 - actor];
        const knocked = future.units.filter(unit => unit.owner !== actor && active(unit)).length -
          result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const lastGlobalTurn = (result.world.turnsPerPlayer || 5) * 2 - 1;
        const risk = result.world.turn < lastGlobalTurn ? replyRisk(result.world, actor,
          settings.lookaheadReplyCount, options.enemyHand || [], difficulty === 'hard',
          settings.replyHorizon) : 0;
        const cardPenalty = tactics.length * options.weights.cardCost;
        const value = nextScore - baseScore + knockoutTacticalValue(knocked, future, options.weights.knockout) -
          risk * options.weights.replyRisk - cardPenalty;
        if (depth > 1) branches.push({ value, world: result.world,
          spent: [...spent, ...tactics.map(tactic => tactic.card)] });
        else best = Math.max(best, value);
      }
    }
    if (depth > 1) {
      branches.sort((a, b) => b.value - a.value);
      for (const branch of branches.slice(0, settings.lookaheadBranches || 1)) {
        const continuation = lookahead(branch.world, actor, difficulty, depth - 1, options, branch.spent);
        best = Math.max(best, branch.value + continuation * options.weights.lookahead);
      }
    }
    return best;
  }

  function rankStructureOptions(snapshot, difficulty, settings, weights) {
    const points = (snapshot.structureCandidates || []).filter(point =>
      !(snapshot.triggers || []).some(trigger => Math.hypot(point.x - trigger.x, point.y - trigger.y) < 45));
    const hand = [...new Set(snapshot.hand || [])].filter(card => card === 'brick' || card === 'data-barrier');
    if (!points.length || !hand.length) return [];
    const actor = snapshot.actor;
    const enemyHand = snapshot.enemyHand || [];
    const offsets = [.9, 1.1];
    const valueAfterSetup = world => {
      const base = score(world);
      const shots = candidates(world, settings.structureCandidates || 4, offsets, {
        bankShots: world.walls || world.bricks.length > 0,
        maxBankTargets: difficulty === 'hard' ? 12 : 6
      });
      let best = -Infinity;
      const stride = Math.max(1, Math.ceil(shots.length / (settings.structureCandidates || 4)));
      for (let index = 0; index < shots.length; index += stride) {
        const result = simulate(world, shots[index], settings.setupHorizon);
        const delta = (result.scores[actor] - result.scores[1 - actor]) -
          (base[actor] - base[1 - actor]);
        const knocked = world.units.filter(unit => unit.owner !== actor && active(unit)).length -
          result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const risk = snapshot.hasReply === false ? 0 : replyRisk(result.world, actor,
          settings.structureReplyCount || 2, enemyHand, difficulty === 'hard', settings.replyHorizon);
        best = Math.max(best, delta + knockoutTacticalValue(knocked, world, weights.knockout) -
          risk * weights.replyRisk);
      }
      return best;
    };
    const baseline = valueAfterSetup(snapshot);
    const options = [];
    for (const card of hand) for (const point of points.slice(0, 6)) {
      const trial = cloneWorld(snapshot);
      trial.bricks.push({ id: `planned-${card}`, ...point, owner: actor, barrier: card === 'data-barrier',
        expiresAtTurn: card === 'data-barrier' ? snapshot.turn + STRUCTURE.barrierLifetimeTurns : null,
        width: STRUCTURE.width, height: STRUCTURE.height, mass: STRUCTURE.mass,
        restitution: STRUCTURE.restitution,
        frictionMultiplier: card === 'data-barrier' ? STRUCTURE.barrierFrictionMultiplier : STRUCTURE.frictionMultiplier,
        vx: 0, vy: 0 });
      const gain = valueAfterSetup(trial) - baseline - weights.cardCost;
      options.push({ structure: { ...point, type: card, value: gain }, value: gain });
    }
    return options.sort((a, b) => b.value - a.value).slice(0, 2);
  }

  function withSetup(snapshot, setup) {
    const world = cloneWorld(snapshot);
    if (setup?.trigger) world.triggers.push({ ...setup.trigger });
    const structure = setup?.structure;
    if (structure) world.bricks.push({ id: `planned-${structure.type}`, x: structure.x, y: structure.y,
      owner: snapshot.actor, barrier: structure.type === 'data-barrier',
      expiresAtTurn: structure.type === 'data-barrier'
        ? snapshot.turn + STRUCTURE.barrierLifetimeTurns : null,
      width: STRUCTURE.width, height: STRUCTURE.height, mass: STRUCTURE.mass,
      restitution: STRUCTURE.restitution,
      frictionMultiplier: structure.type === 'data-barrier'
        ? STRUCTURE.barrierFrictionMultiplier : STRUCTURE.frictionMultiplier, vx: 0, vy: 0 });
    const launcher = world.units.find(unit => unit.id === world.launchId);
    if (launcher && Array.isArray(world.launchYCandidates)) {
      const launchX = launchXForOwner(world, world.actor, launcher);
      const radius = launcher.radius || MOTION.unitRadius;
      const movingWalls = world.walls ? wallSegments(world.mapTime) : [];
      world.launchYCandidates = world.launchYCandidates.filter(y => {
        if (y < TABLE.top + radius || y > TABLE.bottom - radius) return false;
        if (world.units.some(unit => unit.id !== launcher.id && unit.status !== 'fallen' &&
            Math.hypot(unit.x - launchX, unit.y - y) < unit.radius + radius + 2)) return false;
        if (world.bricks.some(brick => Math.abs(brick.x - launchX) < brick.width / 2 + radius &&
            Math.abs(brick.y - y) < brick.height / 2 + radius)) return false;
        return !movingWalls.some(wall => launchX + radius > wall.x && launchX - radius < wall.x + wall.width &&
          y + radius > wall.y && y - radius < wall.y + wall.height);
      });
    }
    return world;
  }

  function jointCardVariants(snapshot) {
    const hand = new Set(snapshot.hand || []);
    const launcherId = snapshot.launchId;
    const protectedUnit = snapshot.units.filter(unit => unit.owner === snapshot.actor && unit.status === 'resting')
      .sort((a, b) => scoreAtX(snapshot, b.x, snapshot.actor) - scoreAtX(snapshot, a.x, snapshot.actor))[0];
    const targetId = protectedUnit?.id || launcherId;
    const variants = [[]], seen = new Set(['']);
    const add = tactics => {
      if (!tactics.every(tactic => hand.has(tactic.card))) return;
      const key = tactics.map(tactic => `${tactic.card}@${tactic.at}:${tactic.targetId || ''}`).join('|');
      if (!seen.has(key)) { seen.add(key); variants.push(tactics); }
    };
    add([{ card: 'hardening', at: 0, targetId }]);
    add([{ card: 'guard', at: 0, targetId }]);
    add([{ card: 'pulse', at: 0 }]);
    add([{ card: 'pulse', at: .7 }]);
    add([{ card: 'blackhole', at: .7 }]);
    add([{ card: 'blackhole', at: 1 }]);
    add([{ card: 'bluffing', at: 0 }]);
    add([{ card: 'repulsion-field', at: 0, targetId }]);
    add([{ card: 'escape', at: 0, targetId }]);
    add([{ card: 'guard', at: 0, targetId }, { card: 'pulse', at: .7 }]);
    add([{ card: 'hardening', at: 0, targetId }, { card: 'pulse', at: .7 }]);
    add([{ card: 'pulse', at: 0 }, { card: 'blackhole', at: 1 }]);
    add([{ card: 'bluffing', at: 0 }, { card: 'blackhole', at: 1 }]);
    // Keep the full small, deterministic set: the former slice discarded escape
    // and every multi-card sequence before setup candidates were compared.
    return variants;
  }

  function rankJointSetups(snapshot, difficulty, settings, weights, enemyHand, useEnemyCards) {
    const triggers = rankTriggerOptions(snapshot, settings, weights, enemyHand, useEnemyCards);
    const structures = difficulty === 'easy' ? [] : rankStructureOptions(snapshot, difficulty, settings, weights);
    const setups = [{ trigger: null, structure: null }];
    for (const entry of triggers) setups.push({ trigger: entry.trigger, structure: null });
    for (const entry of structures) setups.push({ trigger: null, structure: entry.structure });
    for (const trigger of triggers) for (const structure of structures) {
      if (Math.hypot(trigger.trigger.x - structure.structure.x,
          trigger.trigger.y - structure.structure.y) < 45) continue;
      setups.push({ trigger: trigger.trigger, structure: structure.structure });
    }

    const unique = new Map();
    for (const setup of setups) {
      const key = [setup.trigger?.type || '', setup.trigger?.x ?? '', setup.trigger?.y ?? '',
        setup.structure?.type || '', setup.structure?.x ?? '', setup.structure?.y ?? ''].join(':');
      if (!unique.has(key)) unique.set(key, setup);
    }
    const lanes = [...new Set((snapshot.launchYCandidates || []).map(value => Math.round(value)))];
    const laneSamples = lanes.length > 2
      ? [lanes[0], lanes[Math.floor((lanes.length - 1) / 2)], lanes.at(-1)] : lanes;
    if (!laneSamples.length) laneSamples.push(snapshot.units.find(unit => unit.id === snapshot.launchId)?.y || 365);
    const sampleCount = settings.jointSetupSamples || 30;
    const result = [];
    for (const setup of unique.values()) {
      const world = withSetup(snapshot, setup);
      if (snapshot.launchYCandidates?.length && !world.launchYCandidates?.length) continue;
      const base = score(snapshot);
      const shotsPerLane = Math.max(2, Math.ceil(sampleCount / laneSamples.length));
      const samples = [];
      for (const launchY of laneSamples) {
        const laneWorld = cloneWorld(world);
        const launcher = laneWorld.units.find(unit => unit.id === laneWorld.launchId);
        if (launcher) launcher.y = launchY;
        for (const shot of candidates(laneWorld, shotsPerLane, settings.offsets, {
          bankShots: laneWorld.walls || laneWorld.bricks.length > 0, maxBankTargets: 6
        }))
          samples.push({ ...shot, launchY });
      }
      const ranked = samples.map(shot => {
        const simulated = simulate(world, shot, settings.setupHorizon);
        const delta = (simulated.scores[snapshot.actor] - simulated.scores[1 - snapshot.actor]) -
          (base[snapshot.actor] - base[1 - snapshot.actor]);
        const before = snapshot.units.filter(unit => unit.owner !== snapshot.actor && active(unit)).length;
        const after = simulated.world.units.filter(unit => unit.owner !== snapshot.actor && active(unit)).length;
        return { shot, world: simulated.world, value: delta +
          knockoutTacticalValue(before - after, snapshot, weights.knockout) };
      }).sort((a, b) => b.value - a.value).slice(0, 2);
      let best = -Infinity;
      const tacticalResults = [];
      for (const entry of ranked) for (const tactics of jointCardVariants(snapshot)) {
        const simulated = tactics.length ? simulate(world, entry.shot, settings.setupHorizon, tactics) :
          { world: entry.world, scores: score(entry.world) };
        const delta = (simulated.scores[snapshot.actor] - simulated.scores[1 - snapshot.actor]) -
          (base[snapshot.actor] - base[1 - snapshot.actor]);
        const before = snapshot.units.filter(unit => unit.owner !== snapshot.actor && active(unit)).length;
        const after = simulated.world.units.filter(unit => unit.owner !== snapshot.actor && active(unit)).length;
        const knockouts = before - after;
        tacticalResults.push({ world: simulated.world, value: delta +
          knockoutTacticalValue(knockouts, snapshot, weights.knockout) - tactics.length * weights.cardCost });
      }
      tacticalResults.sort((a, b) => b.value - a.value);
      for (const candidate of tacticalResults.slice(0, 2)) {
        const risk = snapshot.hasReply === false ? 0 : replyRisk(candidate.world, snapshot.actor,
          settings.jointReplyCount || 2, enemyHand, useEnemyCards, settings.replyHorizon);
        best = Math.max(best, candidate.value - risk * weights.replyRisk -
          (setup.structure ? weights.cardCost : 0));
      }
      result.push({ ...setup, value: best });
    }
    return result.sort((a, b) => b.value - a.value);
  }

  function plan(snapshot, difficulty = 'normal', tuning = {}) {
    if ((snapshot.prelaunchDelaySeconds || 0) > 0) {
      // The live field keeps running while the worker searches and the AI meter spins.
      // Advance the untouched board to the expected launch instant, including any resting
      // stones or loose structures pushed by the moving rails during that wait.
      snapshot = cloneWorld(snapshot);
      const delaySteps = Math.ceil(snapshot.prelaunchDelaySeconds / STEP);
      for (let index = 0; index < delaySteps; index += 1) step(snapshot);
      snapshot.prelaunchDelaySeconds = 0;
    }
    const policy = tuning.policy || snapshot.aiPolicy || root.UCCAiPolicy;
    const balanceCompatible = !snapshot.balanceFingerprint || snapshot.balanceFingerprint === balanceFingerprint();
    const policyCompatible = Boolean(balanceCompatible && policy &&
      policy.balanceFingerprint === balanceFingerprint() && policy.plannerModelVersion === PLANNER_MODEL_VERSION);
    const mapKey = snapshot.mapId || (snapshot.walls ? 'movingWalls' : snapshot.duel ? 'duel' : 'classic');
    const mapWeights = policyCompatible ? policy.weightsByMap?.[mapKey] : null;
    const mapSettings = policyCompatible ? policy.settingsByMap?.[mapKey] : null;
    const settings = { ...(SETTINGS[difficulty] || SETTINGS.normal),
      ...(policyCompatible ? policy.settings : {}), ...(mapSettings || {}), ...(tuning.settings || {}) };
    const structureComplexity = (snapshot.walls ? 4 : 0) + (snapshot.bricks?.length || 0) * 1.5 +
      (snapshot.triggers?.length || 0) + (snapshot.units?.length || 0) * .35;
    if (difficulty === 'hard' && structureComplexity > 2) {
      settings.candidates = Math.min(720, settings.candidates + Math.round(structureComplexity * 10));
      settings.finalists = Math.min(20, settings.finalists + Math.ceil(structureComplexity / 2));
      settings.replyCount = Math.min(24, settings.replyCount + Math.ceil(structureComplexity / 2));
      settings.launchYCandidateCount = Math.min(13, settings.launchYCandidateCount + Math.ceil(structureComplexity / 3));
    }
    const weights = { ...DEFAULT_WEIGHTS, ...(policyCompatible ? policy.weights : {}),
      ...(mapWeights || {}),
      ...(tuning.weights || snapshot.aiWeights || {}) };
    const options = { settings, weights, hand: snapshot.hand || [], enemyHand: snapshot.enemyHand || [] };
    const actor = snapshot.actor;
    const enemyHand = snapshot.enemyHand || [];
    const handCount = (snapshot.hand || []).length;
    weights.cardCost *= clamp(1 + (2.5 - handCount) * .1, .72, 1.3);
    if (snapshot.hasReply !== false && enemyHand.length) weights.replyRisk *=
      clamp(1 + enemyHand.filter(card => ['ammo', 'blackhole', 'pulse', 'reposition'].includes(card)).length * .06,
        1, 1.3);
    const currentTotals = score(snapshot);
    if (currentTotals[actor] > currentTotals[1 - actor]) weights.replyRisk *= 1.08;
    const useEnemyCards = difficulty === 'hard';
    let jointSetupCandidates = 0, jointSetupBranches = 1;
    if (!tuning.jointBranch) {
      const setups = rankJointSetups(snapshot, difficulty, settings, weights, enemyHand, useEnemyCards);
      jointSetupCandidates = setups.length;
      const beam = setups.slice(0, Math.max(1, settings.setupBeamWidth || 1));
      jointSetupBranches = beam.length;
      const branchBudget = Math.max(48, Math.floor(settings.candidates / beam.length));
      const branchFinalists = Math.max(4, Math.ceil(settings.finalists / beam.length));
      let selected = null;
      let totalEvaluatedShots = 0;
      for (const setup of beam) {
        const branch = plan(snapshot, difficulty, { ...tuning, jointBranch: true, fixedSetup: setup,
          settings: { ...(tuning.settings || {}), candidates: branchBudget, finalists: branchFinalists } });
        totalEvaluatedShots += branch.evaluated || 0;
        if (!selected || branch.score > selected.score) selected = branch;
      }
      if (selected) return { ...selected, evaluated: totalEvaluatedShots, searchStats: {
        ...selected.searchStats, totalBranchShots: totalEvaluatedShots,
        jointSetupCandidates, jointSetupBranches, jointSetupSamples: settings.jointSetupSamples || 0 } };
    }
    const fixedSetup = tuning.fixedSetup || { trigger: null, structure: null };
    const trigger = fixedSetup.trigger || null;
    const structure = fixedSetup.structure || null;
    snapshot = withSetup(snapshot, fixedSetup);
    const launchLanes = rankLaunchLanes(snapshot, settings, weights);
    const laneCount = Math.max(1, launchLanes.length);
    const laneBudgets = [];
    if (laneCount === 1) laneBudgets.push(settings.candidates);
    else {
      const topBudget = Math.floor(settings.candidates * .4);
      const otherBudget = Math.floor((settings.candidates - topBudget) / (laneCount - 1));
      laneBudgets.push(topBudget);
      for (let index = 1; index < laneCount; index += 1) laneBudgets.push(otherBudget);
      laneBudgets[laneBudgets.length - 1] += settings.candidates - laneBudgets.reduce((sum, value) => sum + value, 0);
    }
    const shots = launchLanes.flatMap((lane, laneIndex) => {
      const laneWorld = cloneWorld(snapshot);
      const laneUnit = laneWorld.units.find(unit => unit.id === laneWorld.launchId);
      if (laneUnit) laneUnit.y = lane.y;
      return candidates(laneWorld, laneBudgets[laneIndex], settings.offsets, {
        bankShots: laneWorld.walls || laneWorld.bricks.length > 0,
        maxBankTargets: difficulty === 'hard' ? 36 : difficulty === 'normal' ? 18 : 10
      }).map(shot => ({ ...shot, launchY: lane.y }));
    });
    const baseline = score(snapshot);
    const ranked = [];
    const enemiesBefore = snapshot.units.filter(unit => unit.owner !== actor && active(unit)).length;
    const triggersBefore = snapshot.triggers.length;
    for (const shot of shots) {
      const result = simulate(snapshot, shot, settings.predictionHorizon);
      const delta = (result.scores[actor] - result.scores[1 - actor]) -
        (baseline[actor] - baseline[1 - actor]);
      const own = result.world.units.filter(unit => unit.owner === actor && active(unit));
      const enemiesAfter = result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
      const exposed = own.filter(unit => scoreAtX(snapshot, unit.x, actor) >= 80 && unit.y > TABLE.top + 45 &&
        unit.y < TABLE.bottom - 45).length;
      const knocked = enemiesBefore - enemiesAfter;
      const trapped = triggersBefore - result.world.triggers.length;
      const styleBonus = snapshot.style === 'attacker' ? knocked * 10 :
        snapshot.style === 'controller' ? trapped * 5 :
          snapshot.style === 'defender' ? -exposed * 5 : 0;
      const knockoutPriority = knockoutTacticalValue(knocked, snapshot, weights.knockout);
      ranked.push({ shot, result, value: delta + knockoutPriority + styleBonus -
        exposed * (difficulty === 'easy' ? 0 : 2) });
    }
    ranked.sort((a, b) => b.value - a.value);
    const finalists = ranked.slice(0, settings.finalists);
    const hand = [...new Set(snapshot.hand || [])].filter(id =>
      ['hardening', 'guard', 'pulse', 'blackhole', 'bluffing', 'escape', 'repulsion-field'].includes(id));
    const protectedStones = snapshot.units.filter(unit => unit.owner === actor && unit.status === 'resting')
      .sort((a, b) => scoreAtX(snapshot, a.x, actor) - scoreAtX(snapshot, b.x, actor))
      .slice(0, difficulty === 'hard' ? 3 : 1);
    let best = null;
    for (const entry of finalists) {
      const variants = [[]];
      for (const card of hand) {
        if (card === 'hardening' || card === 'guard' || card === 'bluffing' || card === 'pulse')
          variants.push([{ card, at: 0 }]);
        if (card === 'repulsion-field') variants.push([{ card, at: 0 }]);
        if (card === 'hardening' || card === 'guard' || card === 'bluffing')
          for (const target of protectedStones)
            variants.push([{ card, at: 0, targetId: target.id }]);
        if (card === 'repulsion-field') for (const target of protectedStones)
          variants.push([{ card, at: 0, targetId: target.id }]);
        if (card === 'escape') for (const target of protectedStones)
          variants.push([{ card, at: 0, targetId: target.id }]);
        if (card === 'blackhole') variants.push([{ card, at: .7 }], [{ card, at: 1 }]);
        else if (card === 'hardening' || card === 'pulse') variants.push([{ card, at: .7 }]);
      }
      if (settings.cardDepth > 1) for (const first of hand) for (const second of hand) {
        if (first === second || !['guard', 'bluffing', 'pulse'].includes(first) ||
            !['hardening', 'blackhole', 'pulse'].includes(second)) continue;
        variants.push([{ card: first, at: 0 }, { card: second, at: second === 'blackhole' ? 1 : .7 }]);
      }
      if (settings.cardDepth > 2 && protectedStones.length) for (const defense of ['guard', 'hardening']) {
        if (!hand.includes(defense)) continue;
        for (const first of ['pulse', 'bluffing']) for (const second of ['blackhole', 'hardening']) {
          if (!hand.includes(first) || !hand.includes(second) ||
              new Set([defense, first, second]).size !== 3) continue;
          variants.push([{ card: defense, at: 0, targetId: protectedStones[0].id },
            { card: first, at: 0 }, { card: second, at: second === 'blackhole' ? 1 : .7 }]);
        }
      }
      if (settings.cardDepth > 3 && protectedStones.length &&
          hand.includes('guard') && hand.includes('pulse') && hand.includes('blackhole') && hand.includes('hardening')) {
        variants.push([
          { card: 'guard', at: 0, targetId: protectedStones[0].id },
          { card: 'hardening', at: 0, targetId: protectedStones[0].id },
          { card: 'pulse', at: 0 },
          { card: 'blackhole', at: 1 }
        ]);
      }
      const assessed = [];
      for (const tactics of variants) {
        const result = tactics.length ? simulate(snapshot, entry.shot, settings.predictionHorizon, tactics) : entry.result;
        const immediate = (result.scores[actor] - result.scores[1 - actor]) -
          (baseline[actor] - baseline[1 - actor]);
        const knocked = enemiesBefore - result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const knockoutPriority = knockoutTacticalValue(knocked, snapshot, difficulty === 'hard' ? 1.25 : .5);
        assessed.push({ result, immediate, tactics,
          rough: immediate + knockoutPriority - tactics.length * weights.cardCost });
      }
      assessed.sort((a, b) => b.rough - a.rough);
      const shortlist = assessed.slice(0, difficulty === 'hard' ? 3 : 2);
      for (const card of ['guard', 'hardening']) {
        const defensive = assessed.find(item => item.tactics.some(tactic =>
          tactic.card === card && tactic.targetId));
        if (defensive && !shortlist.includes(defensive)) shortlist.push(defensive);
      }
    for (const [choiceIndex, { result, immediate, tactics }] of shortlist.entries()) {
        const risk = snapshot.hasReply === false ? 0 :
          replyRisk(result.world, actor, settings.replyCount, enemyHand, useEnemyCards,
            settings.replyHorizon);
        const knocked = enemiesBefore - result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const knockoutPriority = knockoutTacticalValue(knocked, snapshot, weights.knockout);
        const riskWeight = weights.replyRisk * (snapshot.style === 'defender' ? 1.4 : 1);
        const setupCost = structure ? weights.cardCost : 0;
        const value = immediate + knockoutPriority - setupCost -
          risk * riskWeight - tactics.length * weights.cardCost +
          (Math.sin((snapshot.seed || 1) + entry.shot.power * 97 + entry.shot.dy * 37) * .5 + .5) *
          settings.uncertainty * 50;
        const futureValue = choiceIndex < 2 && difficulty === 'hard' ? lookahead(result.world, actor, difficulty,
          settings.lookaheadDepth, options, tactics.map(tactic => tactic.card)) :
          choiceIndex < 2 && difficulty === 'normal' ? lookahead(result.world, actor, difficulty, settings.lookaheadDepth, options,
            tactics.map(tactic => tactic.card)) * .55 : 0;
        if (!best || value + futureValue > best.value)
          best = { shot: entry.shot, value: value + futureValue, tactics, futureValue, knocked };
      }
    }
    const choice = best?.shot || { dx: -1, dy: 0, power: .5,
      launchY: launchLanes[0]?.y ?? snapshot.units.find(unit => unit.id === snapshot.launchId)?.y };
    return { ...choice, evaluated: shots.length, searchDepth: settings.cardDepth + settings.lookaheadDepth,
      futureValue: best?.futureValue || 0, score: best?.value || 0,
      tactics: best?.tactics || [], trigger, structure,
      launchY: choice.launchY,
      searchStats: { launchLanes: launchLanes.length, shots: shots.length,
        structureBankShots: shots.filter(shot => shot.bankShot).length,
        selectedBankShot: Boolean(best?.shot?.bankShot),
        allocatedLaneBudget: laneBudgets.reduce((sum, value) => sum + value, 0),
        replySamples: settings.replyCount, cardDepth: settings.cardDepth,
        lookaheadDepth: settings.lookaheadDepth, structureComplexity,
        jointSetupCandidates, jointSetupBranches, jointSetupSamples: settings.jointSetupSamples || 0 },
      plannedMapTime: snapshot.mapTime || 0,
      balanceFingerprint: balanceFingerprint(), policyVersion: policyCompatible ? policy.version : null,
      policyCompatible, balanceCompatible };
  }

  function planReposition(snapshot, difficulty = 'normal', tuning = {}) {
    const eligible = (snapshot.repositionTargetIds || [snapshot.launchId]).filter(id => {
      const unit = snapshot.units.find(item => item.id === id);
      return unit && unit.owner === snapshot.actor && unit.status === 'resting' &&
        (!unit.activeSpecial || snapshot.allowActiveReposition && unit.activeSpecial === 'reposition') &&
        !unit.relaunchUsed;
    });
    if (!eligible.length) return null;

    const search = difficulty === 'hard'
      ? { candidates: 168, finalists: 5, replyCount: 7, cardDepth: 2,
          lookaheadDepth: 0, lookaheadCandidates: 0, lookaheadReplyCount: 0,
          launchYCandidateCount: 1, setupBeamWidth: 1 }
      : difficulty === 'easy'
        ? { candidates: 64, finalists: 3, replyCount: 3, cardDepth: 1,
            lookaheadDepth: 0, lookaheadCandidates: 0, lookaheadReplyCount: 0,
            launchYCandidateCount: 1, setupBeamWidth: 1 }
        : { candidates: 104, finalists: 4, replyCount: 5, cardDepth: 1,
            lookaheadDepth: 0, lookaheadCandidates: 0, lookaheadReplyCount: 0,
            launchYCandidateCount: 1, setupBeamWidth: 1 };
    const targets = difficulty === 'hard' ? eligible.slice(0, 3) : eligible.slice(0, 2);
    let best = null;
    for (const targetId of targets) {
      const result = plan({ ...snapshot, launchId: targetId }, difficulty, {
        ...tuning,
        jointBranch: true,
        fixedSetup: { trigger: null, structure: null },
        settings: { ...search, ...(tuning.settings || {}) }
      });
      if (!result || !Number.isFinite(result.score)) continue;
      if (!best || result.score > best.score)
        best = { ...result, targetId, repositionValue: result.score };
    }
    return best;
  }

  const api = { cloneWorld, simulate, simulateAmmo, planAmmo, plan, planReposition, score, replyRisk, wallSegments, settings: SETTINGS,
    defaultWeights: DEFAULT_WEIGHTS, balanceFingerprint, modelVersion: PLANNER_MODEL_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UCCAiPlanner = api;
})(typeof self !== 'undefined' ? self : globalThis);
