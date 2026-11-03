importScripts('ai-balance.js', 'ai-policy.js', 'ai-planner.js');

// This pass is deliberately small and deterministic. It still uses the planner's
// normal physics model, so existing structures, moving walls, duel scoring, and
// map rules remain active. It skips setup branching to return a usable shot fast.
const PROVISIONAL_SETTINGS = Object.freeze({
  candidates: 48,
  offsets: [0.96, 1, 1.04],
  finalists: 2,
  replyCount: 1,
  cardDepth: 1,
  uncertainty: 0,
  jointSetupSamples: 1,
  jointReplyCount: 1,
  setupBeamWidth: 1,
  lookaheadDepth: 0,
  lookaheadCandidates: 0,
  lookaheadReplyCount: 0,
  launchYCandidateCount: 2,
  setupHorizon: 4,
  replyHorizon: 3,
  predictionHorizon: 6
});

function isUsablePlan(plan) {
  return Boolean(plan && Number.isFinite(plan.dx) && Number.isFinite(plan.dy) &&
    Number.isFinite(plan.power) && plan.balanceCompatible !== false);
}

function computePlan(snapshot, difficulty, tuning, mode) {
  const planner = self.UCCAiPlanner;
  if (String(mode || '').startsWith('ammo'))
    return planner.planAmmo(snapshot, difficulty, tuning);
  if (mode === 'reposition')
    return planner.planReposition(snapshot, difficulty, tuning);
  return planner.plan(snapshot, difficulty, tuning);
}

self.onmessage = event => {
  const { id, snapshot, difficulty, tuning, mode } = event.data;
  try {
    const planner = self.UCCAiPlanner;
    let provisional = null;

    try {
      if (String(mode || '').startsWith('ammo')) {
        // Ammo search exposes no tuning argument. Its easy profile is explicitly
        // capped at 96 directions. For easy difficulty that is already the full
        // requested search, so avoid repeating the same pass.
        if (difficulty !== 'easy')
          provisional = planner.planAmmo(planner.cloneWorld(snapshot), 'easy');
      } else if (mode === 'reposition') {
        // Use normal's structural/map rules without hard's complexity expansion;
        // the small overrides cap candidates and disable lookahead for this pass.
        provisional = planner.planReposition(planner.cloneWorld(snapshot), 'normal', {
          jointBranch: true,
          fixedSetup: { trigger: null, structure: null },
          weights: planner.defaultWeights,
          settings: PROVISIONAL_SETTINGS
        });
      } else {
        provisional = planner.plan(planner.cloneWorld(snapshot), 'normal', {
          jointBranch: true,
          fixedSetup: { trigger: null, structure: null },
          weights: planner.defaultWeights,
          settings: PROVISIONAL_SETTINGS
        });
      }
    } catch {
      // A provisional-pass failure must not prevent the authoritative search.
    }

    if (isUsablePlan(provisional)) self.postMessage({ id, progress: true, plan: provisional });

    // Keep the original difficulty, tuning, and mode for the authoritative
    // final response. Main-thread callers can use the provisional plan if this
    // worker is later terminated by the existing planning budget.
    const plan = computePlan(planner.cloneWorld(snapshot), difficulty, tuning, mode);
    self.postMessage({ id, plan });
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) });
  }
};
