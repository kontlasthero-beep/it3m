const { isTemporarilyGranted } = require('./card-unlocks');

const CARD_LEVELS = Object.freeze({
  hardening: 1, guard: 1, pulse: 1, reposition: 1, brick: 1,
  blackhole: 1, ammo: 1, bluffing: 1, escape: 2, 'data-barrier': 2,
  'repulsion-field': 999, 'dark-charge': 1, release: 1, 'heavy-blow': 1, reinforcements: 1, tracking: 1, neutralize: 1,
  fate: 1, trick: 1
});
const HERO_RESTRICTED_CARDS = Object.freeze({
  'dark-charge': 'trap-master', release: 'trap-master',
  'heavy-blow': 'big-boy', reinforcements: 'big-boy',
  tracking: 'hunter', neutralize: 'hunter',
  fate: 'joker', trick: 'joker'
});

const DEFAULT_DECK = Object.freeze([
  'brick', 'hardening', 'ammo', 'guard', 'pulse', 'blackhole', 'bluffing', 'reposition'
]);
const DECK_PRESET_COUNT = 9;
const HERO_IDS = Object.freeze(['trap-master', 'hunter', 'big-boy', 'joker', 'refiner']);

function normalizeDeckNames(value) {
  const names = Array.isArray(value) ? value : [];
  return Array.from({ length: DECK_PRESET_COUNT }, (_, index) => {
    const name = typeof names[index] === 'string' ? names[index].trim().slice(0, 24) : '';
    return name || `덱 ${index + 1}`;
  });
}

function normalizeDeckHeroes(value) {
  const heroes = Array.isArray(value) ? value : [];
  return Array.from({ length: DECK_PRESET_COUNT }, (_, index) =>
    HERO_IDS.includes(heroes[index]) ? heroes[index] : null);
}

function validateDeck(cards, level, tutorialCompleted = false, heroId = null) {
  if (!Array.isArray(cards) || cards.length !== 8) return false;
  const counts = new Map();
  for (const id of cards) {
    if (typeof id !== 'string' || !CARD_LEVELS[id] ||
        (HERO_RESTRICTED_CARDS[id] && HERO_RESTRICTED_CARDS[id] !== heroId) ||
        (id === 'repulsion-field' && !isTemporarilyGranted(id)) ||
        (!isTemporarilyGranted(id) && CARD_LEVELS[id] > level) ||
        (id === 'reposition' && !tutorialCompleted)) return false;
    counts.set(id, (counts.get(id) || 0) + 1);
    if (counts.get(id) > 2) return false;
  }
  return [...counts.values()].filter(count => count === 2).length <= 1;
}

function normalizeDecks(value, level, tutorialCompleted = false, heroes = null) {
  const decks = Array.isArray(value) ? value : [];
  const normalizedHeroes = normalizeDeckHeroes(heroes);
  return Array.from({ length: DECK_PRESET_COUNT }, (_, index) => validateDeck(decks[index], level, tutorialCompleted, normalizedHeroes[index]) ? [...decks[index]] : null);
}

function deckForPreset(decks, activePreset, level, tutorialCompleted = false, heroes = null) {
  return normalizeDecks(decks, level, tutorialCompleted, heroes)[activePreset] || DEFAULT_DECK.map(id => id === 'reposition' && !tutorialCompleted ? 'hardening' : id);
}

module.exports = { CARD_LEVELS, DEFAULT_DECK, DECK_PRESET_COUNT, HERO_IDS, validateDeck, normalizeDecks, normalizeDeckNames, normalizeDeckHeroes, deckForPreset };
