(function (root, factory) {
  const marks = factory();
  if (typeof module === 'object' && module.exports) module.exports = marks;
  else root.SecondChanceAdventureMarks = marks;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_ICON_SET = 'beacon';
  const MAX_MARKS = 3;
  const ICON_SETS = Object.freeze({
    beacon: Object.freeze({
      label: '탐사 비콘',
      earnedSrc: 'adventure/reward-icons/exploration-mark-b-beacon.png',
      unearnedSrc: 'adventure/reward-icons/exploration-mark-b-beacon-broken.png'
    }),
    wayfinder: Object.freeze({
      label: '항로 화살촉',
      earnedSrc: 'adventure/reward-icons/exploration-mark-a-wayfinder.png',
      unearnedSrc: 'adventure/reward-icons/exploration-mark-a-wayfinder-broken.png'
    })
  });
  const EDITOR_ASSETS = Object.freeze([
    ['exploration-mark-a-wayfinder.png', '탐사 표식 A · 항로 화살촉'],
    ['exploration-mark-a-wayfinder-broken.png', '탐사 표식 A · 깨진 항로 화살촉'],
    ['exploration-mark-b-beacon.png', '탐사 표식 B · 탐사 비콘'],
    ['exploration-mark-b-beacon-broken.png', '탐사 표식 B · 깨진 탐사 비콘'],
    ['exploration-mark-c-route-seal.png', '탐사 표식 C · 경로 인장']
  ].map(([file, name]) => Object.freeze({ file, name, src: `adventure/reward-icons/${file}` })));
  const BONUS_TYPES = Object.freeze([
    Object.freeze({ id: 'hand-card', label: '클리어 시 손패에 카드 보유' }),
    Object.freeze({ id: 'trigger-count', label: '트리거 획득 개수' }),
    Object.freeze({ id: 'variable', label: '직접 입력 · 스테이지 변수 판정' })
  ]);
  const OPERATORS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte']);

  function normalizeConfig(input) {
    const iconSet = Object.hasOwn(ICON_SETS, input?.iconSet) ? input.iconSet : DEFAULT_ICON_SET;
    const bonus = (Array.isArray(input?.bonus) ? input.bonus : []).slice(0, MAX_MARKS - 1)
      .map(condition => {
        if (condition?.type === 'hand-card' && typeof condition.cardId === 'string' && condition.cardId.trim()) {
          return { type: 'hand-card', cardId: condition.cardId.trim().slice(0, 80) };
        }
        if (condition?.type === 'trigger-count') {
          const count = Number(condition.count);
          return { type: 'trigger-count', count: Number.isFinite(count) ? Math.max(1, Math.min(50, Math.round(count))) : 1 };
        }
        if (condition?.type === 'variable') return {
          type: 'variable', description: String(condition.description || '').slice(0, 240),
          variableId: String(condition.variableId || '').slice(0, 100),
          operator: OPERATORS.has(condition.operator) ? condition.operator : 'eq',
          value: String(condition.value ?? 'true').slice(0, 200)
        };
        return null;
      }).filter(Boolean);
    return { iconSet, bonus };
  }

  function createConfig() { return normalizeConfig(null); }

  function variableEarned(condition, context) {
    const definition = (context.variableDefinitions || []).find(item => item.id === condition.variableId);
    if (!definition || !Object.hasOwn(context.variableValues || {}, condition.variableId)) return false;
    let actual = context.variableValues[condition.variableId];
    let expected = condition.value;
    if (definition.type === 'number') {
      if (String(actual).trim() === '' || String(expected).trim() === '') return false;
      actual = Number(actual); expected = Number(expected);
      if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
    } else if (definition.type === 'boolean') {
      actual = actual === true; expected = expected === 'true';
    } else {
      actual = String(actual ?? ''); expected = String(expected ?? '');
    }
    switch (condition.operator) {
      case 'eq': return actual === expected;
      case 'ne': return actual !== expected;
      case 'gt': return actual > expected;
      case 'gte': return actual >= expected;
      case 'lt': return actual < expected;
      case 'lte': return actual <= expected;
      default: return false;
    }
  }

  function evaluate(input, context = {}) {
    const config = normalizeConfig(input);
    const cleared = context.cleared === true;
    const hand = new Set(context.handCardIds || []);
    const triggers = new Set(context.collectedTriggerIds || []);
    const bonus = config.bonus.map(condition => ({ ...condition, earned: cleared && (
      condition.type === 'hand-card' ? hand.has(condition.cardId) :
      condition.type === 'trigger-count' ? triggers.size >= condition.count : variableEarned(condition, context)
    ) }));
    return { iconSet: config.iconSet, count: cleared ? 1 + bonus.filter(condition => condition.earned).length : 0,
      max: MAX_MARKS, bonus };
  }

  return { DEFAULT_ICON_SET, MAX_MARKS, ICON_SETS, EDITOR_ASSETS, BONUS_TYPES, createConfig, normalizeConfig, evaluate };
});
