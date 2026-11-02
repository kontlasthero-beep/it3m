(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SecondChanceCardUnlocks = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Temporary global grants can be revoked later by changing the value to false.
  const TEMPORARY_GLOBAL_CARD_GRANTS = Object.freeze({ 'repulsion-field': true });
  return Object.freeze({
    TEMPORARY_GLOBAL_CARD_GRANTS,
    isTemporarilyGranted(id) { return TEMPORARY_GLOBAL_CARD_GRANTS[id] === true; }
  });
});
