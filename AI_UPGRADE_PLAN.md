# Second Chance AI Upgrade

## Objective

Build an AAB opponent that plans with the same rules as the live game, combines shots, cards, triggers, structures, and launch placement, and changes its strategy when board conditions or game balance change. Keep player-facing AI intent text out of the game.

## Findings from the current implementation

- The planner and live game had separate moving-wall geometry. The planner used a 14 px wall thickness while the live wall is 18.4 px.
- Black-hole card prediction used an outdated range and omitted the temporary 50% friction reduction applied to affected stones and structures.
- The live game resolves moving-wall collisions with loose structures; the planner did not.
- The AI chooses its launch Y position with a clearance heuristic before its shot search, so it cannot compare launch position and shot as one decision.
- Card candidates are a fixed list attached to pre-ranked shots. Cards can change a shot's value, but they cannot rescue a promising shot that was discarded before card evaluation.
- Self-play used fixed launch positions and policies. It omitted a selected structure from the simulated board, and swapped-first-player matches changed the seed, map, and deck at the same time.
- AI style is chosen randomly once per match. The worker receives difficulty but no tuned policy, so self-play results cannot currently flow into live planning.

## Implementation milestones

### 1. Repair planner and self-play parity — started

- Use the planner's moving-wall geometry in the live game so wall locations, dimensions, and velocities have one source.
- Match the live wall dimensions and simulate wall impacts on movable structures.
- Include current black-hole range, duration, and friction reduction in rollouts.
- Put planned structures into self-play states and compare first-player swaps on the same seed.

### Implementation update — 2026-11-03

- Added `ai-balance.js` as the shared, fingerprinted source for table geometry, map friction, launch physics, turns, scoring, card forces, hardening, repulsion, and structure physics. The game, planner, worker, and self-play harness now read the same values for these rules.
- The live planning snapshot now carries map identity, balance fingerprint, hero-adjusted stone properties, barriers, repulsion fields, and the actual owner-specific launch x positions. Duel P2 and self-play now both use the actual 1060 launch x.
- AAB now evaluates launch-lane candidates by simulating representative scoring and collision paths before the full shot/card search. The chosen lane is returned with the plan and used before the launch-placement animation.
- Launch lanes and shots are now compared in one scored candidate set: each lane receives a share of the search budget, and its shot outcomes compete directly with shots from other lanes. Self-play uses the same legal launch-height candidates, including occupied units, structures, and moving-wall overlap checks.
- AAB's tactical stance is recalculated at each turn from score pressure, leading stones, congestion, map structures, and available control cards. It is not locked into the old match-long random style. No intent text is exposed in the UI.
- A plan includes its map-time and search-shape diagnostics. On the moving-rail map, placement keeps only a currently legal lane; aiming requests a fresh plan projected to launch time instead of reusing the placement shot.
- Self-play now uses the planner's actual baseline weights, paired side swaps on the same seed/map, separate holdout seeds, and per-map/per-opponent results. It includes the item map's per-turn trigger pickup and escape/repulsion-field cards. It can recommend distinct map weights; recommendations never silently overwrite the live policy.
- The tuner now supports scoped diagnostics (`--map`, `--opponent`, `--candidate-count`) and reports pair completion to stderr. This lets us validate a narrow balance change before paying for a full cross-map tournament.
- Policy weights and settings are accepted only when both the game-balance fingerprint and planner-model version match. Rule or search-model changes therefore invalidate stale tuned parameters; physics simulations still rank actions using current rule values. The policy format supports map-specific tuning.
- Candidate budgets follow lane proxy ranking: the highest-ranked lane receives 40% of the budget, with the rest spread over alternate lanes. Moving-wall phase projection advances the whole board to expected launch time and rechecks plain shots at lock-in if the predicted phase is materially off. Timed-out worker searches are terminated and pending requests released; the AAB wait limit remains 120 seconds.
- Added structure-aware bank-shot candidates to lane ranking, lookahead, and final shot search. The planner mirrors scoring points and relevant stones across the predicted faces of moving rails and placed structures, then runs those aims through the same collision rollout before considering them. Search diagnostics now record how many bank-shot candidates were evaluated and whether the chosen shot used one. The planner model version was advanced so stale tuned policies are not reused.
- Fixed moving-rail phase drift: the live game continues animating rails while the worker searches and the AI meter spins, so a plan made from the observed frame could be stale by launch. Structure-map snapshots now project the rails to the estimated launch time using a per-phase worker-time estimate; placement only reuses a legal launch lane and requests its shot after placement. If the predicted phase is still off at lock-in, a plain shot plan gets one fresh search. Bank-shot geometry also now expands obstacle faces by the stone radius and converts placed-structure center coordinates into rectangle coordinates before mirroring.
- Improved structure-route coverage after review showed the old global candidate cap could be exhausted by the first few rails. Bank aims now sample all five moving rails at six phases across the likely flight window, allocate candidates round-robin across rail/phase groups, include loose structures, and widen AAB's bank-shot budget. Structure-placement evaluation also considers those routes.
- Fixed a structure-map rollout cutoff: the planner used to stop as soon as stones and loose structures rested, even though moving rails stayed active. It now simulates the entire prediction window on rail maps, so later rail contacts that push a resting stone are included. A targeted comparison confirmed the rail changed the predicted resting position by about 188 px versus an otherwise identical no-rail board.
- Added direct-fire ammo planning to the worker. It samples target-contact angles for stones, cover, moving rails, and guard satellites; simulates bullet interception, structure destruction, charged-pulse activation, and contact-normal ricochets from repulsion fields; then scores the settled board, knockouts, and friendly fire. Projectile speed, size, mass, impulse, and ricochet speed now come from the shared balance manifest. A targeted smoke selected a direct enemy-stone hit and confirmed the target moved.
- Replaced the reposition card's old straight-line estimate with a dedicated worker search. It compares eligible stones and runs the full structure-aware shot/card/reply simulation for each candidate, returning the selected stone and its aim plan. The live AI now uses that result and refreshes it against current rail phase before relaunch; the old heuristic remains only as a worker-unavailable fallback.
- Extended prediction windows across candidate screening, setup/trigger/structure evaluation, final card branches, and reply-risk checks. The previous short 5–9 second screening could discard a good rail/structure line before the later collision happened. Easy, normal, and AAB use 8/10/12 second setup screens, 7/8/9 second reply checks, and 10/13/16 second final action horizons. Resting worlds still stop early on static maps. The planner model and policy version were bumped so cached or tuned v8 weights cannot be mistaken for v9.
- Made worker creation, worker runtime, message, and main-thread planner failures visible as developer-console warnings while preserving the safe fallback. This distinguishes a genuine structure-planning failure from a session that silently dropped to the simpler fallback.
- Replaced precommitted trigger/structure setup with a bounded joint setup beam. It proposes no-setup, trigger-only, structure-only, and non-overlapping trigger+structure combinations; each is screened with launch lanes, shots, knockouts, and a reply estimate. Leading setup branches then split the shot budget and receive full card-combination, reply-risk, and lookahead evaluation. The best complete-turn plan supplies the setup and launch action together. The planner model version is bumped so older tuned weights are rejected until re-evaluated.
- Fixed a guard-trigger edge case that could make satellite angle coordinates `NaN` on the first frame the trigger was collected. The self-play harness now throws with the turn/unit context if a planner action or simulated world contains a non-finite value, instead of silently converting invalid score margins to JSON `null`.
- Narrow tuning command for a quick paired training/holdout diagnostic: `node tools/self-play-tune.cjs --tune --games 1 --holdout-games 1 --map movingWalls --opponent balanced --candidate-count 2`. Small samples validate plumbing only; they are not sufficient to promote weights.

### Remaining implementation work

- Finish parity for every card and trigger that AAB can receive, especially hero-specific cards and adventure-only objects when applicable. Escape, repulsion-field, direct-fire ammo, and reposition now participate in worker-based simulation/search.
- Extend the structural rollout to model interactions between moving rails and newly dropped structures at matched sub-frame timing; bank candidates now sample rail phase broadly, while rollout remains the final arbiter.
- Make the worker search anytime and cancellable, returning its best valid action as it deepens rather than holding the result until all branches finish.
- Expand joint setup branches to cover more trigger variants and structure placements on complex boards; proposal and beam widths are currently bounded to control turn time.
- Add deterministic parity snapshots for score, fall, stone/structure collision, moving-wall phase, and card outcomes; then run paired self-play across maps, heroes, richer decks, and opponent styles. The current harness covers the item map and representative escape/repulsion cards but not every hero or ammo/reposition sequence.
- Promote a tuned map policy only after a sufficiently large holdout set shows improvement without a major regression. Re-run tuning whenever the balance fingerprint changes.
- Important limit: a new fingerprint rejects stale learned weights, but it does not train replacement weights automatically. Until a safe promotion workflow exists, AAB falls back to current default weights while still simulating with the new balance values and adapting its per-turn tactical stance to the live board.

### 2. Complete the shared rule model

- Match stone and structure collision response, guard satellites, charged pulse, repulsion-field response and bullet ricochet, hardening, barriers, and structure expiry.
- Carry map orientation, scoring direction, launch bounds, hero modifiers, deck counts, and trigger rules in the same versioned world snapshot.
- Compare predicted and live outcomes for a fixed set of states before widening the search.

### 3. Search the full action together

- Jointly search launch Y, aim, power, launch timing, card targets and timing, trigger placement, and structure placement.
- Retain promising candidates after evaluating combinations, rather than discarding shots before card effects are considered.
- Recheck top plans against the latest moving-wall phase immediately before launch and refine or replace stale plans. This refresh is now wired for placement-to-aim transitions; continuous refinement during an extended search remains open.

### 4. Add adversarial multi-turn planning

- Evaluate the opponent's strongest plausible reply, then candidate counter-replies and later scoring opportunities.
- Use actual score difference, remaining stones and cards, knockouts, and end-of-match outcomes as the objective.
- Spend more search effort on high-impact collisions, close scores, and terminal turns.

### 5. Make balance changes adapt the policy

- Keep all tunable values in a versioned balance manifest consumed by both game and planner.
- Derive candidate value from simulated outcomes, so changing range, friction, collision force, or card duration changes which action wins the evaluation.
- Extend self-play across maps, heroes, decks, launch positions, and opponent archetypes. Use paired seeds and holdout seeds.
- Tune style and evaluation parameters against a pool of opponents; do not bind AAB to a randomly selected fixed style for the whole match.
- Export the selected policy with its balance fingerprint and pass it through the worker interface. Reject or retune policies when the balance fingerprint changes.
- Promote a tuned policy only when it improves holdout performance without a major regression on a map or opponent archetype.

### 6. Give AAB a larger but bounded thinking budget

- Run search incrementally in a worker and retain the best fully evaluated plan as it progresses.
- Cancel obsolete searches when the board or match changes. Use adaptive budgets based on branching and decision impact.
- Record search time, completed depth, candidate quality, and fallback usage for tuning. Do not display the AI's intended move to players.

## Completion criteria

- Planner and live game agree on collision, fall, scoring, and card outcomes for representative deterministic states, including moving-wall and structure-map cases.
- AAB compares complete action sequences and responds to balance changes through simulation and the versioned tuning pipeline.
- Self-play uses representative state generation, paired seeds, varied opponent styles, and a separate holdout set; its report includes overall and per-map/per-opponent results.
- AAB returns its best valid plan within its budget and never falls back solely because a slower search did not finish in a fixed short window.

The target is a very challenging opponent. A near-impossible win rate is a tuning goal to measure against human matches and holdout tournaments, not a guaranteed result from search depth alone.
