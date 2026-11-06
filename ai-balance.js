(function (root) {
  'use strict';

  const rules = {
    schemaVersion: 1,
    turnsPerPlayer: 5,
    scoring: { knockoutPoints: 25 },
    table: { left: 88, right: 1112, top: 68, bottom: 662, goalX: 108, launchX: 1060 },
    motion: {
      unitRadius: 29, launchScale: 5.566, maxPullDistance: 275, directionPullDistance: 96,
      maxLaunchSpeed: 1392, stopSpeed: 12, restitution: .84, separation: .52,
      impactScale: .65
    },
    maps: {
      classic: { friction: .020625, walls: false, duel: false },
      ice: { friction: .0165, walls: false, duel: false },
      movingWalls: { friction: .020625, walls: true, duel: false },
      items: { friction: .020625, walls: false, duel: false },
      duel: { friction: .020625, walls: false, duel: true }
    },
    blackhole: {
      range: 136.5 * 1.25, duration: .85, impulse: 650,
      affectedFrictionMultiplier: .5, triggerRangeMultiplier: 1.35
    },
    pulse: {
      range: 150.9375, impulse: 274.21875,
      triggerRangeMultiplier: 1.15 * 1.35, triggerImpulseMultiplier: 1.35,
      chargeDelay: .5, friendlyForceMultiplier: .5
    },
    hardening: { frictionPerStack: 2 },
    repulsion: { responseMultiplier: .5, impactMultiplier: 1.5 },
    bullet: { speedMultiplier: 3, radiusScale: .25, mass: .12,
      targetImpulseScale: 1.72, ricochetSpeedScale: .5 },
    structure: {
      width: 18, height: 64, mass: 2, restitution: .58, frictionMultiplier: 1.5,
      barrierFrictionMultiplier: 1, barrierLifetimeTurns: 2
    }
  };

  function stable(value) {
    if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
  }

  function fingerprint(value = rules) {
    const source = stable(value);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `sc${rules.schemaVersion}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  const manifest = Object.freeze({ ...rules, fingerprint: fingerprint(rules), stable, fingerprintOf: fingerprint });
  root.UCCAiBalance = manifest;
  if (typeof module !== 'undefined' && module.exports) module.exports = manifest;
})(typeof self !== 'undefined' ? self : globalThis);
