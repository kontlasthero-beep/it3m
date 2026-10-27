/*
 * Pure Adventure power-network evaluation. All coordinates are absolute board units.
 * evaluatePowerNetwork({ beacons = [], wires = [], devices = [], stones = [],
 *   structures = [], pulseHits = [], snapDistance = 12 }) returns
 *   { poweredById: Map<string, boolean>, activeById: Map<string, boolean> }.
 * Both maps contain every respective network ID; poweredById contains beacons,
 * wires and devices, while activeById contains beacons only. A powered beacon
 * can be receiving power while inactive; only active beacons source/relay it.
 * Input arrays and their objects are never changed.
 *
 * Beacon: { id, x, y, radius, initialActive = false, logic = 'all'|'any',
 *   conditions = ['powered'|'stone'|'pulse'|'structure', ...],
 *   portMode = 'both' }. With no conditions, initialActive controls activation.
 * Otherwise initialActive is ignored. 'powered' means power arriving through a
 * connected wire; 'pulse' means the beacon ID is in pulseHits (Set or array).
 * Stone/structure overlap uses circles { x, y, radius }; a structure may also
 * use an axis-aligned centered rectangle { x, y, width, height }.
 *
 * Wire: { id, points: [{x,y}, ...], portMode = 'both', collidable = false }.
 * At least two points are required. Only first/last endpoints connect; line
 * crossings and intermediate vertices do not. collidable has no electrical
 * effect. Device: { id, x, y, radius, portMode = 'input' }.
 * A wire endpoint connects to another wire endpoint, beacon center or device
 * center at distance <= snapDistance (inclusive). Radius is for physical
 * overlap, not electrical snapping. Connections carry power from output/both
 * to input/both. Wires and devices in 'both' mode relay received power. A
 * beacon relays only while active. IDs must be unique across all three kinds.
 * The result is the least fixed point from independently active beacons: loops
 * of beacons requiring only incoming power cannot energize themselves.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SecondChanceAdventurePower = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  }

  function circlesOverlap(a, b) {
    const reach = Math.max(0, a.radius || 0) + Math.max(0, b.radius || 0);
    return distanceSquared(a, b) <= reach * reach;
  }

  function circleOverlapsRectangle(circle, rect) {
    const halfWidth = Math.max(0, rect.width || 0) / 2;
    const halfHeight = Math.max(0, rect.height || 0) / 2;
    const dx = Math.max(Math.abs(circle.x - rect.x) - halfWidth, 0);
    const dy = Math.max(Math.abs(circle.y - rect.y) - halfHeight, 0);
    const radius = Math.max(0, circle.radius || 0);
    return dx * dx + dy * dy <= radius * radius;
  }

  function overlapsLandingArea(beacon, item) {
    return item && (item.width != null && item.height != null
      ? circleOverlapsRectangle(beacon, item)
      : circlesOverlap(beacon, item));
  }

  function canInput(mode) { return mode === 'input' || mode === 'both'; }
  function canOutput(mode) { return mode === 'output' || mode === 'both'; }

  function evaluatePowerNetwork({ beacons = [], wires = [], devices = [], stones = [],
    structures = [], pulseHits = [], snapDistance = 12 } = {}) {
    const hits = pulseHits instanceof Set ? pulseHits : new Set(pulseHits);
    const nodes = new Map();
    const edges = new Map();
    const endpoints = [];
    const receivers = [];
    const activeById = new Map();

    function addNode(item, kind, defaultMode) {
      if (typeof item.id !== 'string' || !item.id || nodes.has(item.id)) {
        throw new TypeError('Power-network IDs must be unique nonempty strings');
      }
      const mode = item.portMode || defaultMode;
      if (!['input', 'output', 'both'].includes(mode)) {
        throw new TypeError(`Invalid portMode for ${item.id}`);
      }
      nodes.set(item.id, { item, kind, mode });
      edges.set(item.id, new Set());
    }

    for (const beacon of beacons) {
      addNode(beacon, 'beacon', 'both');
      activeById.set(beacon.id, false);
      receivers.push({ id: beacon.id, point: beacon });
    }
    for (const wire of wires) {
      addNode(wire, 'wire', 'both');
      if (!Array.isArray(wire.points) || wire.points.length < 2) {
        throw new TypeError(`Wire ${wire.id} needs at least two {x,y} points`);
      }
      endpoints.push({ id: wire.id, point: wire.points[0] });
      endpoints.push({ id: wire.id, point: wire.points[wire.points.length - 1] });
    }
    for (const device of devices) {
      addNode(device, 'device', 'input');
      receivers.push({ id: device.id, point: device });
    }

    function connect(a, b) {
      if (a === b) return;
      const left = nodes.get(a);
      const right = nodes.get(b);
      if (canOutput(left.mode) && canInput(right.mode)) edges.get(a).add(b);
      if (canOutput(right.mode) && canInput(left.mode)) edges.get(b).add(a);
    }

    const snapSquared = Math.max(0, snapDistance) ** 2;
    for (let i = 0; i < endpoints.length; i++) {
      const end = endpoints[i];
      for (let j = i + 1; j < endpoints.length; j++) {
        const other = endpoints[j];
        if (distanceSquared(end.point, other.point) <= snapSquared) connect(end.id, other.id);
      }
      for (const receiver of receivers) {
        if (distanceSquared(end.point, receiver.point) <= snapSquared) connect(end.id, receiver.id);
      }
    }

    function incomingPowered(id, powered) {
      for (const [from, outgoing] of edges) {
        if (nodes.get(from).kind === 'wire' && outgoing.has(id) && powered.has(from)) return true;
      }
      return false;
    }

    function conditionMet(condition, beacon, powered) {
      switch (condition) {
        case 'powered': return incomingPowered(beacon.id, powered);
        case 'stone': return stones.some(stone => overlapsLandingArea(beacon, stone));
        case 'structure': return structures.some(structure => overlapsLandingArea(beacon, structure));
        case 'pulse': return hits.has(beacon.id);
        default: throw new TypeError(`Invalid beacon condition: ${condition}`);
      }
    }

    // Each iteration can only add active beacons. Propagation is restarted from
    // active sources, so an inactive conditional beacon cannot act as a relay.
    let powered = new Set();
    let changed;
    do {
      changed = false;
      for (const beacon of beacons) {
        if (activeById.get(beacon.id)) continue;
        const conditions = beacon.conditions || [];
        if (!Array.isArray(conditions)) throw new TypeError(`Invalid conditions for ${beacon.id}`);
        const met = conditions.length === 0 ? Boolean(beacon.initialActive)
          : (beacon.logic === 'any'
            ? conditions.some(condition => conditionMet(condition, beacon, powered))
            : conditions.every(condition => conditionMet(condition, beacon, powered)));
        if (met) {
          activeById.set(beacon.id, true);
          changed = true;
        }
      }
      if (changed) {
        powered = new Set([...activeById].filter(([, active]) => active).map(([id]) => id));
        const queue = [...powered];
        for (let index = 0; index < queue.length; index++) {
          const from = queue[index];
          if (nodes.get(from).kind === 'beacon' && !activeById.get(from)) continue;
          for (const to of edges.get(from)) {
            if (powered.has(to)) continue;
            powered.add(to);
            queue.push(to);
          }
        }
      }
    } while (changed);

    const poweredById = new Map([...nodes.keys()].map(id => [id, powered.has(id)]));
    return { poweredById, activeById };
  }

  return { evaluatePowerNetwork, distanceSquared, circlesOverlap,
    circleOverlapsRectangle, overlapsLandingArea };
});
