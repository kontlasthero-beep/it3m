(function (root) {
  'use strict';
  root.UCCAiPolicy = Object.freeze({
    version: 5,
    plannerModelVersion: 'sc-plan-2026-11-structure-phase-search-10',
    balanceFingerprint: root.UCCAiBalance?.fingerprint || null,
    weights: Object.freeze({ knockout: 1.12, replyRisk: .78, cardCost: 5.5, lookahead: .58 }),
    settings: Object.freeze({}),
    weightsByMap: Object.freeze({}),
    settingsByMap: Object.freeze({})
  });
})(typeof self !== 'undefined' ? self : globalThis);
