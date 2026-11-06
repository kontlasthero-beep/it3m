# Power object art and interaction contract

## Current art

- `beacons/pressure-beacon-off.png` and `pressure-beacon-on.png`: transparent top-down pressure plate concept. The inactive sprite is the geometry reference. The active version lights only the existing recessed slots. Both images share a 1272 × 1236 canvas.
- `wires/floor-circuit-straight-off-concept.png` and `floor-circuit-straight-on-concept.png`: transparent, flush floor-conductor concepts. Both images share a 2172 × 724 canvas. They express material and light behavior; they are **not** seamless route tiles. Do not repeat these PNGs end-to-end in gameplay.
- The local editor lists these under independent **비콘** and **전선** asset categories. The off-state beacon and floor wire are the single placement entries; the active image is chosen from electrical state.

## Routed wire and power behavior

Represent one wire as a polyline of board-space points, with its first and last points snapped to ports on a beacon, another wire, or a powered device. Drawing from the same centerline and stroke at every segment and join guarantees a continuous junction regardless of length or bends. Editor handles should add, move and remove route points, with optional 90-degree corner snapping. The game should render this path under stones, first with a dark copper/graphite base and then with a cyan emissive stroke when powered. Individual wires may later opt into physical collision; the initial floor-conductor type never collides. Keep collision as an explicit per-type property, separate from the wire asset category.

Each power object needs stable object and port IDs. A port may allow input, output, or both. Electrical propagation traverses only allowed output-to-input connections, recalculating when source state or wiring changes. A pressure beacon sources power while a stone overlaps its landing region; a wire can pass incoming power through to downstream ports. Guard against cycles by visiting each port once per recomputation. Logical power state and presentation animation must remain separate.

When power turns on, animate the emissive trace along the already drawn path and add a restrained local glow at beacons and junctions. When power turns off, fade the glow quickly while retaining the base art. Emit a small activation/deactivation sound at the source and a quieter relay click at a receiving structure; avoid one sound per wire segment. Reserve sparse particles for endpoints and powered structures, not the entire length of every wire.

The editor stores a wire as `runtime.routePoints` (flat x/y pairs). The game renders the same polyline with a constant-width base and powered trace. The power evaluator connects endpoints within 12 board units; middle crossings do not connect. Each beacon evaluates its selected stone, incoming-power, pulse and structure conditions with AND or OR logic. Pulse contact is latched for the current stage attempt. Powered structures glow and expose `power-on`/`power-off` signals to the scene event engine. Power changes use the existing energy sound at restrained volume; dedicated power audio and physical collision wires remain future art/mechanic options.
