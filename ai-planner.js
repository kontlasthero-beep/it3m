(function (root) {
  'use strict';

  const TABLE = { left: 88, right: 1112, top: 68, bottom: 662, goalX: 108, launchX: 1060 };
  const RESTITUTION = .84;
  const STOP_SPEED = 12;
  const STEP = 1 / 120;
  const SETTINGS = {
    easy: { candidates: 132, offsets: [.88, .96, 1.04, 1.12], replyCount: 8, finalists: 5, cardDepth: 1, uncertainty: .035,
      lookaheadDepth: 0, lookaheadCandidates: 0, lookaheadReplyCount: 0 },
    normal: { candidates: 240, offsets: [.84, .92, 1, 1.08, 1.16], replyCount: 12, finalists: 8, cardDepth: 2, uncertainty: .008,
      lookaheadDepth: 1, lookaheadCandidates: 3, lookaheadReplyCount: 2, lookaheadBranches: 1 },
    hard: { candidates: 560, offsets: [.76, .84, .92, 1, 1.08, 1.16, 1.24], replyCount: 18, finalists: 14, cardDepth: 4, uncertainty: .001,
      lookaheadDepth: 2, lookaheadCandidates: 3, lookaheadReplyCount: 3, lookaheadBranches: 1 }
  };
  const DEFAULT_WEIGHTS = { knockout: 1.12, replyRisk: .78, cardCost: 5.5, lookahead: .58 };

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const active = unit => unit.status !== 'fallen' && unit.status !== 'ready';
  const phased = (unit, turn) => (unit.ability?.bluffingUntilTurn ?? -1) >= turn;

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

  function friction(world, unit) {
    const stacks = unit.ability?.stacks?.hardening ?? (unit.ability?.hardening ? 1 : 0);
    let multiplier = unit.frictionMultiplier ?? 3 ** stacks;
    if (!phased(unit, world.turn)) for (const brick of world.bricks) {
      if (!(brick.barrier && brick.owner === unit.owner) && Math.abs(unit.x - brick.x) <= brick.width / 2 + unit.radius &&
          Math.abs(unit.y - brick.y) <= brick.height / 2 + unit.radius) multiplier += (brick.frictionMultiplier || 1.5) - 1;
    }
    return world.friction * multiplier * (unit.heroFriction || 1) * (unit.openingFrictionMultiplier || 1);
  }

  function score(world) {
    const totals = [...world.points];
    for (const unit of world.units) {
      if (!active(unit)) continue;
      totals[unit.owner] += Math.round(Math.max(0, 100 * (1 - (unit.x - TABLE.goalX) / (TABLE.right - TABLE.goalX))));
    }
    return totals;
  }

  function wallSegments(time) {
    const track = (min, max, phase = 0, frequency = .72) => {
      const angle = time * frequency + phase;
      return { value: min + (max - min) * (1 - Math.cos(angle)) / 2,
        velocity: (max - min) * Math.sin(angle) * frequency / 2 };
    };
    const width = 108, height = 14, centerX = (TABLE.left + TABLE.right) / 2;
    const leftMax = centerX - 142 - width, rightMin = centerX + 142;
    const lt = track(TABLE.left + 14, leftMax);
    const rt = track(TABLE.right - 14 - width, rightMin, Math.PI);
    const lb = track(TABLE.left + 26, leftMax - 28, Math.PI * .3);
    const rb = track(TABLE.right - 26 - width, rightMin + 28, Math.PI * 1.3);
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
      const teamScale = chargedCard && target.owner === source.owner && !target.width ? .5 : 1;
      target.vx += nx * impulse * teamScale;
      target.vy += ny * impulse * teamScale;
      if (!target.width) target.status = 'sliding';
    }
    if (chargedCard) world.bricks = world.bricks.filter(brick => Math.hypot(brick.x - source.x, brick.y - source.y) > range);
  }

  function detonateChargedPulse(world, source) {
    if (!source.ability?.pulse || source.status === 'fallen') return false;
    source.ability.pulse = false;
    pulse(world, source, 150.9375, 274.21875, true);
    return true;
  }

  function blackhole(world, source, range) {
    source.fluidTimer = .85;
    for (const target of [...world.units, ...world.bricks]) {
      if (target === source || target.barrier || target.status === 'fallen' || target.status === 'ready') continue;
      const dx = source.x - target.x, dy = source.y - target.y;
      const distance = Math.hypot(dx, dy);
      if (distance > range || distance < .001) continue;
      const targetFriction = target.width ? world.friction * (target.frictionMultiplier || 1.5) : friction(world, target);
      const force = 650 * (.72 + .28 * (1 - distance / range)) / (1 + targetFriction * 18);
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
    } else if (card === 'blackhole') {
      blackhole(world, source, 136.5);
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
      a.x -= nx * overlap * .52; a.y -= ny * overlap * .52;
      b.x += nx * overlap * .52; b.y += ny * overlap * .52;
      const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relative < 0) {
        const impulse = -(1 + RESTITUTION) * relative / 2;
        a.vx -= impulse * nx; a.vy -= impulse * ny;
        b.vx += impulse * nx; b.vy += impulse * ny;
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
      const impulse = -(1 + (brick ? rect.restitution || .58 : RESTITUTION)) * toward /
        (brick && !rect.barrier ? 1 + 1 / (rect.mass || 2) : 1);
      unit.vx += impulse * nx; unit.vy += impulse * ny;
      if (brick && !rect.barrier) { rect.vx -= impulse * nx / (rect.mass || 2); rect.vy -= impulse * ny / (rect.mass || 2); }
      for (const pending of unit.pendingPulseTriggers || []) pulse(world, unit, pending.range, pending.impulse);
      unit.pendingPulseTriggers = [];
    }
    detonateChargedPulse(world, unit);
    if (unit.status === 'resting' && Math.hypot(unit.vx, unit.vy) > STOP_SPEED) unit.status = 'sliding';
  }

  function step(world) {
    world.mapTime += STEP;
    for (const brick of world.bricks) {
      if (brick.barrier) { brick.vx = brick.vy = 0; continue; }
      brick.x += brick.vx * STEP; brick.y += brick.vy * STEP;
      const drag = Math.pow(Math.max(0, 1 - world.friction * (brick.frictionMultiplier || 1.5)), STEP * 60);
      brick.vx *= drag; brick.vy *= drag;
      if (Math.hypot(brick.vx, brick.vy) < 5) brick.vx = brick.vy = 0;
      const hw = brick.width / 2, hh = brick.height / 2, bounce = brick.restitution || .58;
      if (brick.x < TABLE.left + hw) { brick.x = TABLE.left + hw; brick.vx = Math.abs(brick.vx) * bounce; }
      if (brick.x > TABLE.right - hw) { brick.x = TABLE.right - hw; brick.vx = -Math.abs(brick.vx) * bounce; }
      if (brick.y < TABLE.top + hh) { brick.y = TABLE.top + hh; brick.vy = Math.abs(brick.vy) * bounce; }
      if (brick.y > TABLE.bottom - hh) { brick.y = TABLE.bottom - hh; brick.vy = -Math.abs(brick.vy) * bounce; }
    }
    for (const unit of world.units) {
      if (unit.status === 'fallen') continue;
      unit.fluidTimer = Math.max(0, (unit.fluidTimer || 0) - STEP);
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
        if (trigger.type === 'pulse') unit.pendingPulseTriggers.push({ remaining: .5, range: trigger.range, impulse: trigger.impulse });
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
    collideStones(world);
    for (const brick of [...world.bricks]) for (const unit of world.units) {
      if (world.bricks.includes(brick)) collideRect(unit, brick, world, true, true);
    }
    if (world.walls) for (const wall of wallSegments(world.mapTime)) {
      const rect = { ...wall, x: wall.x + wall.width / 2, y: wall.y + wall.height / 2 };
      for (const unit of world.units) collideRect(unit, rect, world, true, false);
    }
    for (const source of world.units) {
      const ability = source.ability;
      if (!active(source) || !ability?.guard) continue;
      const count = Math.min(2, ability.stacks?.guard || 1) * 2;
      const orbit = source.radius * 1.875, satRadius = source.radius * .35;
      for (let index = 0; index < count; index += 1) {
        if (ability.destroyedGuardSatellites?.includes(index)) continue;
        const angle = ability.guardAngle + index * Math.PI * 2 / count;
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
    for (const tactic of tactics) if (tactic.at === 0)
      applyCard(world, tactic.card, world.units.find(item => item.id === (tactic.targetId || unit.id)));
    const speed = clamp(275 * shot.power * 5.566, 35, 1392) * (unit.powerScale || 1);
    unit.vx = shot.dx * speed; unit.vy = shot.dy * speed;
    unit.status = 'sliding';
    const steps = Math.ceil(limit / STEP);
    for (let index = 0; index < steps; index += 1) {
      for (const tactic of tactics) if (tactic.at > 0 && tactic.at <= index * STEP &&
        tactic.at > (index - 1) * STEP)
        applyCard(world, tactic.card, world.units.find(item => item.id === (tactic.targetId || unit.id)));
      step(world);
      if (index > 4 && !world.units.some(item => item.status === 'sliding') &&
          !world.bricks.some(item => Math.hypot(item.vx, item.vy) > 5)) break;
    }
    return { world, scores: score(world) };
  }

  function candidates(snapshot, count, offsets) {
    const unit = snapshot.units.find(item => item.id === snapshot.launchId);
    const targets = [];
    const random = (() => {
      let seed = ((snapshot.seed || 1) >>> 0) || 1;
      return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    })();
    const ySpan = TABLE.bottom - TABLE.top - unit.radius * 2 - 36;
    for (let index = 0; index < Math.ceil(count / offsets.length); index += 1) {
      const lane = (index + .35 + random() * .3) / Math.ceil(count / offsets.length);
      targets.push({ x: TABLE.goalX + unit.radius + 25 + random() * 260,
        y: TABLE.top + unit.radius + 18 + ySpan * lane });
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
    const shots = [];
    for (const target of targets) {
      const dx = target.x - unit.x, dy = target.y - unit.y;
      const distance = Math.hypot(dx, dy) || 1;
      const travel = distance * -60 * Math.log(clamp(1 - snapshot.friction * (unit.heroFriction || 1) *
        (unit.openingFrictionMultiplier || 1) * (unit.frictionMultiplier || 3 **
        (unit.ability?.stacks?.hardening || 0)), .001, .999));
      const basePower = travel / (275 * 5.566 * (unit.powerScale || 1));
      for (const offset of offsets) shots.push({ dx: dx / distance, dy: dy / distance,
        power: clamp(basePower * offset, .06, 1) });
    }
    return shots;
  }

  function replyRisk(world, actor, count, enemyHand = [], useCards = false) {
    if (!count || !world.units.some(unit => unit.owner === actor && active(unit))) return 0;
    const enemy = 1 - actor;
    const reply = cloneWorld(world);
    reply.actor = enemy;
    reply.turn += 1;
    reply.launchId = 'reply';
    reply.koPoints = world.replyKoPoints || 25;
    reply.units.push({ id: 'reply', owner: enemy, x: TABLE.launchX, y: 365,
      radius: world.replyStone?.radius || 29, status: 'ready', vx: 0, vy: 0,
      heroFriction: world.replyStone?.heroFriction || 1,
      powerScale: world.replyStone?.powerScale || 1,
      fallPenalty: world.replyStone?.fallPenalty || 0,
      pendingPulseTriggers: [] });
    const targets = world.units.filter(unit => unit.owner === actor && active(unit))
      .sort((a, b) => a.x - b.x).slice(0, 3);
    const before = score(world);
    const replies = [];
    const cards = useCards ? [...new Set(enemyHand)].filter(id =>
      ['blackhole', 'pulse', 'bluffing', 'guard', 'hardening'].includes(id)) : [];
    const oldEnemy = world.units.filter(unit => unit.owner === enemy && active(unit))
      .sort((a, b) => a.x - b.x)[0];
    for (const target of targets) for (const lateral of [0, -target.radius * .6, target.radius * .6]) {
      const dx = target.x - TABLE.launchX, dy = target.y + lateral - 365;
      const length = Math.hypot(dx, dy) || 1;
      const base = length * -60 * Math.log(clamp(1 - reply.friction *
        (reply.units.at(-1).heroFriction || 1), .001, .999)) /
        (275 * 5.566 * (reply.units.at(-1).powerScale || 1));
      for (const offset of [.9, 1.1]) replies.push({ dx: dx / length, dy: dy / length,
        power: clamp(base * offset, .1, 1) });
    }
    const sampled = replies.filter((_, index) => index % Math.max(1, Math.ceil(replies.length / count)) === 0)
      .slice(0, count);
    const values = [];
    for (const shot of sampled) {
      let best = null;
      const variants = [[], ...cards.map(card => [{ card, at: card === 'blackhole' ? 1 : 0 }])];
      if (oldEnemy && cards.includes('blackhole'))
        variants.push([{ card: 'blackhole', at: 0, targetId: oldEnemy.id }]);
      for (const tactics of variants) {
        const result = simulate(reply, shot, 7, tactics);
        const knocked = targets.filter(target => result.world.units.find(unit => unit.id === target.id)?.status === 'fallen').length;
        const gain = (result.scores[enemy] - result.scores[actor]) - (before[enemy] - before[actor]);
        const value = gain + knocked * 12;
        if (best === null || value > best) best = value;
      }
      const specialPressure = useCards && (enemyHand.includes('ammo') || enemyHand.includes('reposition')) ?
        targets.some(unit => unit.x < TABLE.goalX + 200) ? 9 : 3 : 0;
      values.push(Math.max(0, best || 0) + specialPressure);
    }
    values.sort((a, b) => b - a);
    return (values[0] || 0) * .55 + (values[1] || 0) * .3 +
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length) * .15;
  }

  function chooseTrigger(snapshot, settings, enemyHand, useCards) {
    if (!snapshot.triggerCandidates?.length) return null;
    const launcher = snapshot.units.find(unit => unit.id === snapshot.launchId);
    if (!launcher) return null;
    const probes = [365, 255, 475].map(y => {
      const dx = TABLE.goalX + 130 - launcher.x, dy = y - launcher.y;
      const length = Math.hypot(dx, dy) || 1;
      const power = clamp(length * -60 * Math.log(clamp(1 - snapshot.friction *
        (launcher.heroFriction || 1), .001, .999)) / (275 * 5.566 * (launcher.powerScale || 1)), .1, 1);
      return { dx: dx / length, dy: dy / length, power };
    });
    const evaluate = world => {
      const base = score(snapshot);
      let best = -Infinity;
      for (const shot of probes) {
        const result = simulate(world, shot, 8);
        const immediate = (result.scores[snapshot.actor] - result.scores[1 - snapshot.actor]) -
          (base[snapshot.actor] - base[1 - snapshot.actor]);
        const risk = snapshot.hasReply === false ? 0 : replyRisk(result.world, snapshot.actor,
          Math.min(3, settings.replyCount), enemyHand, useCards);
        best = Math.max(best, immediate - risk * .5);
      }
      return best;
    };
    const baseline = evaluate(snapshot);
    let choice = null, best = baseline + 5;
    for (const candidate of snapshot.triggerCandidates.slice(0, 8)) for (const type of ['guard', 'hardening', 'pulse', 'blackhole']) {
      const trial = cloneWorld(snapshot);
      trial.triggers.push({ ...candidate, type, radius: 14.5,
        range: type === 'pulse' ? 150.9375 * 1.15 * 1.35 : 136.5 * 1.35,
        impulse: type === 'pulse' ? 274.21875 * 1.35 : undefined });
      const value = evaluate(trial);
      if (value > best) { best = value; choice = trial.triggers.at(-1); }
    }
    return choice;
  }

  function lookahead(world, actor, difficulty, depth, options, spent = []) {
    if (depth <= 0) return 0;
    const future = cloneWorld(world);
    const priorLaunch = future.units.find(unit => unit.id === future.launchId);
    const id = `lookahead-${actor}-${future.turn}-${depth}`;
    future.actor = actor;
    future.turn += 2;
    future.launchId = id;
    future.units.push({ id, owner: actor, x: TABLE.launchX, y: 365, vx: 0, vy: 0,
      radius: priorLaunch?.radius || 29, status: 'ready', heroFriction: priorLaunch?.heroFriction || 1,
      powerScale: priorLaunch?.powerScale || 1, fallPenalty: priorLaunch?.fallPenalty || 0,
      pendingPulseTriggers: [] });
    const settings = options.settings;
    const offsets = difficulty === 'hard' ? [.88, 1, 1.12] : [.92, 1.08];
    const candidateShots = candidates(future, settings.lookaheadCandidates, offsets);
    const baseline = score(future);
    const available = (options.hand || []).filter(card => !spent.includes(card));
    const cardOrder = ['blackhole', 'pulse', 'guard', 'hardening', 'bluffing'];
    const cards = available.sort((a, b) => cardOrder.indexOf(a) - cardOrder.indexOf(b))
      .slice(0, difficulty === 'hard' ? 3 : 2);
    const targets = future.units.filter(unit => unit.owner === actor && active(unit) && unit.id !== id)
      .sort((a, b) => a.x - b.x).slice(0, 2);
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
        const result = simulate(future, shot, 8, tactics);
        const nextScore = result.scores[actor] - result.scores[1 - actor];
        const baseScore = baseline[actor] - baseline[1 - actor];
        const knocked = future.units.filter(unit => unit.owner !== actor && active(unit)).length -
          result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const risk = result.world.turn < 9 ? replyRisk(result.world, actor,
          settings.lookaheadReplyCount, options.enemyHand || [], difficulty === 'hard') : 0;
        const cardPenalty = tactics.length * options.weights.cardCost;
        const value = nextScore - baseScore + knocked * (future.koPoints || 25) * options.weights.knockout -
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

  function chooseStructure(snapshot, difficulty, settings, weights) {
    const points = (snapshot.structureCandidates || []).filter(point =>
      !(snapshot.triggers || []).some(trigger => Math.hypot(point.x - trigger.x, point.y - trigger.y) < 45));
    const hand = [...new Set(snapshot.hand || [])].filter(card => card === 'brick' || card === 'data-barrier');
    if (!points.length || !hand.length || snapshot.hasReply === false) return null;
    const actor = snapshot.actor;
    const enemyHand = snapshot.enemyHand || [];
    const offsets = [.9, 1.1];
    const valueAfterSetup = world => {
      const base = score(world);
      const shots = candidates(world, settings.structureCandidates || 4, offsets);
      let best = -Infinity;
      const stride = Math.max(1, Math.ceil(shots.length / (settings.structureCandidates || 4)));
      for (let index = 0; index < shots.length; index += stride) {
        const result = simulate(world, shots[index], 8);
        const delta = (result.scores[actor] - result.scores[1 - actor]) -
          (base[actor] - base[1 - actor]);
        const knocked = world.units.filter(unit => unit.owner !== actor && active(unit)).length -
          result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const risk = replyRisk(result.world, actor, settings.structureReplyCount || 2,
          enemyHand, difficulty === 'hard');
        best = Math.max(best, delta + knocked * (world.koPoints || 25) * weights.knockout -
          risk * weights.replyRisk);
      }
      return best;
    };
    const baseline = valueAfterSetup(snapshot);
    let selected = null;
    let bestGain = 4;
    for (const card of hand) for (const point of points.slice(0, 6)) {
      const trial = cloneWorld(snapshot);
      trial.bricks.push({ id: `planned-${card}`, ...point, owner: actor, barrier: card === 'data-barrier',
        expiresAtTurn: card === 'data-barrier' ? snapshot.turn + 2 : null,
        width: 18, height: 64, mass: 2, restitution: .58, frictionMultiplier: card === 'data-barrier' ? 1 : 1.5,
        vx: 0, vy: 0 });
      const gain = valueAfterSetup(trial) - baseline - weights.cardCost;
      if (gain > bestGain) { bestGain = gain; selected = { ...point, type: card, value: gain }; }
    }
    return selected;
  }

  function plan(snapshot, difficulty = 'normal', tuning = {}) {
    const settings = { ...(SETTINGS[difficulty] || SETTINGS.normal), ...(tuning.settings || {}) };
    const weights = { ...DEFAULT_WEIGHTS, ...(tuning.weights || snapshot.aiWeights || {}) };
    const options = { settings, weights, hand: snapshot.hand || [], enemyHand: snapshot.enemyHand || [] };
    const actor = snapshot.actor;
    const enemyHand = snapshot.enemyHand || [];
    const useEnemyCards = difficulty === 'hard';
    const trigger = chooseTrigger(snapshot, settings, enemyHand, useEnemyCards);
    if (trigger) snapshot = { ...snapshot, triggers: [...snapshot.triggers, trigger] };
    const structure = difficulty === 'easy' ? null : chooseStructure(snapshot, difficulty, settings, weights);
    if (structure) snapshot = { ...snapshot, bricks: [...snapshot.bricks, {
      id: `planned-${structure.type}`, x: structure.x, y: structure.y, owner: actor,
      barrier: structure.type === 'data-barrier', expiresAtTurn: structure.type === 'data-barrier' ? snapshot.turn + 2 : null,
      width: 18, height: 64, mass: 2, restitution: .58,
      frictionMultiplier: structure.type === 'data-barrier' ? 1 : 1.5, vx: 0, vy: 0
    }] };
    const baseline = score(snapshot);
    const shots = candidates(snapshot, settings.candidates, settings.offsets);
    const ranked = [];
    const enemiesBefore = snapshot.units.filter(unit => unit.owner !== actor && active(unit)).length;
    const triggersBefore = snapshot.triggers.length;
    for (const shot of shots) {
      const result = simulate(snapshot, shot, difficulty === 'hard' ? 9 : 8);
      const delta = (result.scores[actor] - result.scores[1 - actor]) -
        (baseline[actor] - baseline[1 - actor]);
      const own = result.world.units.filter(unit => unit.owner === actor && active(unit));
      const enemiesAfter = result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
      const exposed = own.filter(unit => unit.x < TABLE.goalX + 110 && unit.y > TABLE.top + 45 &&
        unit.y < TABLE.bottom - 45).length;
      const knocked = enemiesBefore - enemiesAfter;
      const trapped = triggersBefore - result.world.triggers.length;
      const styleBonus = snapshot.style === 'attacker' ? knocked * 10 :
        snapshot.style === 'controller' ? trapped * 5 :
          snapshot.style === 'defender' ? -exposed * 5 : 0;
      const knockoutPriority = knocked * (snapshot.koPoints || 25) * weights.knockout;
      ranked.push({ shot, result, value: delta + knockoutPriority + styleBonus -
        exposed * (difficulty === 'easy' ? 0 : 2) });
    }
    ranked.sort((a, b) => b.value - a.value);
    const finalists = ranked.slice(0, settings.finalists);
    const hand = [...new Set(snapshot.hand || [])].filter(id =>
      ['hardening', 'guard', 'pulse', 'blackhole', 'bluffing'].includes(id));
    const protectedStones = snapshot.units.filter(unit => unit.owner === actor && unit.status === 'resting')
      .sort((a, b) => a.x - b.x).slice(0, difficulty === 'hard' ? 2 : 1);
    let best = null;
    for (const entry of finalists) {
      const variants = [[]];
      for (const card of hand) {
        if (card === 'hardening' || card === 'guard' || card === 'bluffing' || card === 'pulse')
          variants.push([{ card, at: 0 }]);
        if (card === 'hardening' || card === 'guard' || card === 'bluffing')
          for (const target of protectedStones)
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
        const result = tactics.length ? simulate(snapshot, entry.shot, difficulty === 'hard' ? 9 : 8, tactics) : entry.result;
        const immediate = (result.scores[actor] - result.scores[1 - actor]) -
          (baseline[actor] - baseline[1 - actor]);
        const knocked = enemiesBefore - result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const knockoutPriority = knocked * (snapshot.koPoints || 25) * (difficulty === 'hard' ? 1.25 : .5);
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
          replyRisk(result.world, actor, settings.replyCount, enemyHand, useEnemyCards);
        const knocked = enemiesBefore - result.world.units.filter(unit => unit.owner !== actor && active(unit)).length;
        const knockoutPriority = knocked * (snapshot.koPoints || 25) * weights.knockout;
        const riskWeight = weights.replyRisk * (snapshot.style === 'defender' ? 1.4 : 1);
        const value = immediate + knockoutPriority -
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
    const choice = best?.shot || { dx: -1, dy: 0, power: .5 };
    const intent = structure ? (structure.type === 'data-barrier' ? '상대 진입로를 차단' : '충돌 경로에 구조물 배치') :
      trigger ? `${trigger.type} 트리거로 다음 수 준비` :
        best?.tactics?.length ? ({ guard: '주요 스톤의 방어선 강화', hardening: '득점 스톤의 위치 고정',
          pulse: '근접한 상대를 지속 압박', blackhole: '상대를 충돌 궤도로 끌어들임',
          bluffing: '충돌을 피해 빈 경로로 진입' }[best.tactics[0].card] || '카드 연계 수') :
          best?.knocked ? '상대 스톤 제거를 노림' : '득점 위치와 반격 위험을 함께 계산';
    return { ...choice, evaluated: shots.length, searchDepth: settings.cardDepth + settings.lookaheadDepth,
      futureValue: best?.futureValue || 0, score: best?.value || 0,
      tactics: best?.tactics || [], trigger, structure, intent };
  }

  const api = { cloneWorld, simulate, plan, score, replyRisk, settings: SETTINGS, defaultWeights: DEFAULT_WEIGHTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.UCCAiPlanner = api;
})(typeof self !== 'undefined' ? self : globalThis);
