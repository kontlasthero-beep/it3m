(function (root, factory) {
  const loadout = factory();
  if (typeof module === 'object' && module.exports) module.exports = loadout;
  else root.SecondChanceAdventureLoadout = loadout;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const CARDS = Object.freeze([
    { id: 'hardening', name: '경질화', art: 'Card_illustration/hardening.png' },
    { id: 'guard', name: '방호벽', art: 'Card_illustration/Protective barrier.png' },
    { id: 'pulse', name: '방출', art: 'Card_illustration/release .png' },
    { id: 'reposition', name: '재배치', art: 'Card_illustration/Relocation.png' },
    { id: 'brick', name: '구조물 투하', art: 'Card_illustration/Structure Drop.png' },
    { id: 'blackhole', name: '블랙홀 방출', art: 'Card_illustration/blackhole release.png' },
    { id: 'ammo', name: '총알 장전', art: 'Card_illustration/Load.png' },
    { id: 'bluffing', name: '속임수', art: 'Card_illustration/Bluffing.png' },
    { id: 'escape', name: '탈출', art: 'Card_illustration/Escape.png' },
    { id: 'data-barrier', name: '데이터 장벽', art: 'Card_illustration/Data Barrier-v5.png' },
    { id: 'tracking', name: '추적', art: 'Card_illustration/tracking.png' },
    { id: 'neutralize', name: '무력화', art: 'Card_illustration/neutralize.png' }
  ]);
  const CARD_IDS = new Set(CARDS.map(card => card.id));
  const MAX_CARDS = 40;

  function createLoadout() {
    return { startingHand: { mode: 'ordered', drawCount: 0, cards: [] }, deck: { mode: 'ordered', cards: [] } };
  }

  function normalizeLoadout(input) {
    if (input == null) {
      const legacy = createLoadout();
      legacy.startingHand.cards.push('reposition');
      legacy.startingHand.drawCount = 1;
      legacy.deck.cards.push('reposition');
      return legacy;
    }
    const result = createLoadout();
    for (const section of ['startingHand', 'deck']) {
      const source = input[section];
      if (!source || !Array.isArray(source.cards) || source.cards.length > MAX_CARDS ||
          source.cards.some(id => !CARD_IDS.has(id)))
        throw new Error(`${section} 카드 목록이 올바르지 않습니다.`);
      if (source.mode !== 'ordered' && source.mode !== 'random')
        throw new Error(`${section} 뽑기 방식이 올바르지 않습니다.`);
      result[section] = { mode: source.mode, cards: [...source.cards] };
    }
    const count = input.startingHand.drawCount ?? result.startingHand.cards.length;
    if (!Number.isInteger(count) || count < 0 || count > result.startingHand.cards.length)
      throw new Error('시작 손패 장수가 올바르지 않습니다.');
    result.startingHand.drawCount = count;
    const bagCounts = new Map();
    for (const id of result.deck.cards) bagCounts.set(id, (bagCounts.get(id) || 0) + 1);
    for (const id of result.startingHand.cards) {
      const available = bagCounts.get(id) || 0;
      if (available) bagCounts.set(id, available - 1);
      else result.deck.cards.push(id);
    }
    if (result.deck.cards.length > MAX_CARDS)
      throw new Error(`플레이어 가방은 ${MAX_CARDS}장까지 지정할 수 있습니다.`);
    return result;
  }

  function shuffle(cards, random) {
    const result = [...cards];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('무작위 값이 올바르지 않습니다.');
      const j = Math.floor(value * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function resolveLoadout(input, random = Math.random) {
    const { startingHand, deck } = normalizeLoadout(input);
    const handCards = startingHand.mode === 'random' ? shuffle(startingHand.cards, random) : startingHand.cards;
    const selectedHand = handCards.slice(0, startingHand.drawCount);
    const remaining = [...deck.cards];
    for (const id of selectedHand) remaining.splice(remaining.indexOf(id), 1);
    return { startingHand: selectedHand, deck: deck.mode === 'random' ? shuffle(remaining, random) : remaining };
  }

  return { CARDS, MAX_CARDS, createLoadout, normalizeLoadout, resolveLoadout };
});
