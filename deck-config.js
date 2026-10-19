const CARD_LEVELS = Object.freeze({
  hardening: 1, guard: 1, pulse: 1, reposition: 1, brick: 1,
  blackhole: 1, ammo: 1, bluffing: 1, escape: 2, 'data-barrier': 2
});

const DEFAULT_DECK = Object.freeze([
  'brick', 'hardening', 'ammo', 'guard', 'pulse', 'blackhole', 'bluffing', 'reposition'
]);

function validateDeck(cards, level, tutorialCompleted = false) {
  if (!Array.isArray(cards) || cards.length !== 8) return false;
  const counts = new Map();
  for (const id of cards) {
    if (typeof id !== 'string' || !CARD_LEVELS[id] || CARD_LEVELS[id] > level || (id === 'reposition' && !tutorialCompleted)) return false;
    counts.set(id, (counts.get(id) || 0) + 1);
    if (counts.get(id) > 2) return false;
  }
  return [...counts.values()].filter(count => count === 2).length <= 1;
}

function normalizeDecks(value, level, tutorialCompleted = false) {
  const decks = Array.isArray(value) ? value : [];
  return Array.from({ length: 3 }, (_, index) => validateDeck(decks[index], level, tutorialCompleted) ? [...decks[index]] : null);
}

function deckForPreset(decks, activePreset, level, tutorialCompleted = false) {
  return normalizeDecks(decks, level, tutorialCompleted)[activePreset] || DEFAULT_DECK.map(id => id === 'reposition' && !tutorialCompleted ? 'hardening' : id);
}

module.exports = { CARD_LEVELS, DEFAULT_DECK, validateDeck, normalizeDecks, deckForPreset };
