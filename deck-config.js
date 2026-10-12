const CARD_LEVELS = Object.freeze({
  hardening: 1, guard: 1, pulse: 1, reposition: 1, brick: 1,
  blackhole: 1, ammo: 1, bluffing: 1, escape: 2
});

const DEFAULT_DECK = Object.freeze([
  'brick', 'hardening', 'ammo', 'guard', 'pulse', 'blackhole', 'bluffing', 'reposition'
]);

function validateDeck(cards, level) {
  if (!Array.isArray(cards) || cards.length !== 8) return false;
  const counts = new Map();
  for (const id of cards) {
    if (typeof id !== 'string' || !CARD_LEVELS[id] || CARD_LEVELS[id] > level) return false;
    counts.set(id, (counts.get(id) || 0) + 1);
    if (counts.get(id) > 2) return false;
  }
  return [...counts.values()].filter(count => count === 2).length <= 1;
}

function normalizeDecks(value, level) {
  const decks = Array.isArray(value) ? value : [];
  return Array.from({ length: 3 }, (_, index) => validateDeck(decks[index], level) ? [...decks[index]] : null);
}

function deckForPreset(decks, activePreset, level) {
  return normalizeDecks(decks, level)[activePreset] || [...DEFAULT_DECK];
}

module.exports = { CARD_LEVELS, DEFAULT_DECK, validateDeck, normalizeDecks, deckForPreset };
