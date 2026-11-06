(function (root, factory) {
  const catalog = factory();
  if (typeof module === 'object' && module.exports) module.exports = catalog;
  else root.SecondChanceAdventureEvents = catalog;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const triggers = [
    { id: 'stage-start', label: '스테이지 시작' },
    { id: 'trigger-collected', label: '트리거 획득', object: true },
    { id: 'object-collision', label: '개체 충돌', object: true },
    { id: 'unit-resting', label: '스톤 정지' },
    { id: 'zone-enter', label: '영역 진입', object: true },
    { id: 'card-used', label: '카드 사용', card: true },
    { id: 'stage-success', label: '스테이지 성공' },
    { id: 'stage-failure', label: '스테이지 실패' },
    { id: 'variable-changed', label: '변수 변경', variable: true },
    { id: 'power-on', label: '전력 활성화', object: true },
    { id: 'power-off', label: '전력 비활성화', object: true }
  ];
  const actions = [
    { id: 'dialogue', label: '대사 출력', dialogue: true },
    { id: 'illustration', label: '삽화 출력', asset: 'image' },
    { id: 'screen-shake', label: '화면 흔들림' },
    { id: 'play-sound', label: '효과음 재생', asset: 'audio' },
    { id: 'show-object', label: '개체 표시', object: true },
    { id: 'hide-object', label: '개체 숨김', object: true },
    { id: 'set-variable', label: '변수 설정', variable: true },
    { id: 'add-variable', label: '숫자 변수 더하기', variable: true }
  ];
  const comparators = [
    { id: 'eq', label: '=' }, { id: 'ne', label: '!=' },
    { id: 'gt', label: '>' }, { id: 'gte', label: '>=' },
    { id: 'lt', label: '<' }, { id: 'lte', label: '<=' }
  ];
  // The editor reads these controls from the same catalogue as gameplay event types.
  // Add a field here whenever a runtime mechanic becomes configurable in the game.
  const mechanics = [
    { category: 'stone', label: '스톤 · 충돌 상태', fields: [
      { key: 'fixed', label: '고정 · 충격으로 움직이지 않음', type: 'boolean', default: false },
      { key: 'neutralizeOnCollision', label: '다음 충돌 시 중립화', type: 'boolean', default: false }
    ] },
    { category: 'beacon', label: '압력 비콘 · 전력 조건', fields: [
      { key: 'powerInitialActive', label: '조건이 없을 때 활성', type: 'boolean', default: false },
      { key: 'powerLogic', label: '조건 결합', type: 'select', options: [
        { value: 'all', label: '그리고 · 모두 만족' }, { value: 'any', label: '또는 · 하나 이상 만족' }
      ], default: 'all' },
      { key: 'conditionPowered', label: '전력을 공급받으면', type: 'boolean', default: false },
      { key: 'conditionStone', label: '비콘 위에 스톤이 놓이면', type: 'boolean', default: false },
      { key: 'conditionPulse', label: '방출 파동에 닿으면 (한 번 충전 후 유지)', type: 'boolean', default: false },
      { key: 'conditionStructure', label: '비콘 위에 구조물이 놓이면', type: 'boolean', default: false },
      { key: 'powerPortMode', label: '전력 접점', type: 'select', options: [
        { value: 'input', label: '입력' }, { value: 'output', label: '출력' }, { value: 'both', label: '입력 + 출력' }
      ], default: 'both' }
    ] },
    { category: 'wire', label: '바닥 전선 · 접점', fields: [
      { key: 'wirePortMode', label: '전력 접점', type: 'select', options: [
        { value: 'input', label: '입력' }, { value: 'output', label: '출력' }, { value: 'both', label: '입력 + 출력' }
      ], default: 'both' }
    ] },
    { category: 'structure', label: '전력 반응 구조물', fields: [
      { key: 'powerReactive', label: '전력을 공급받으면 활성', type: 'boolean', default: false },
      { key: 'powerPortMode', label: '전력 접점', type: 'select', options: [
        { value: 'input', label: '입력' }, { value: 'output', label: '출력' }, { value: 'both', label: '입력 + 출력' }
      ], default: 'input' }
    ] },
    { assetId: 'builtin:dummy-stone', label: '파동 더미 스톤', fields: [
      { key: 'pulseRadius', label: '파동 반경', type: 'number', min: 1, max: 500, step: 1, default: 118 },
      { key: 'pulseImpulseMultiplier', label: '파동 밀침 배율', type: 'number', min: 0, max: 10, step: .1, default: 1 },
      { key: 'ricochetRestitution', label: '반발 계수', type: 'number', min: 0, max: 3, step: .05, default: 1 },
      { key: 'rechargeSeconds', label: '재충전 시간 (초)', type: 'number', min: 0, max: 30, step: .1, default: 1.5 },
      { key: 'velocityMultiplierOnHit', label: '충돌 시 속도 배율', type: 'number', min: 0, max: 10, step: .1, default: 1 },
      { key: 'frictionMultiplierOnHit', label: '충돌 시 마찰 배율', type: 'number', min: 0, max: 10, step: .1, default: 1 },
      { key: 'pulseEffectSeconds', label: '파동 표시 시간 (초)', type: 'number', min: 0, max: 10, step: .01, default: .48 }
    ] },
    { assetId: 'builtin:dummy-trigger', label: '재배치 트리거', fields: [
      { key: 'mechanicId', label: '게임 내 기믹', type: 'select', options: [
        { value: 'reposition-trigger', label: '재배치 획득' }, { value: 'none', label: '연출용 개체' }
      ], default: 'reposition-trigger' },
      { key: 'frictionMultiplier', label: '마찰 배율', type: 'number', min: 0, max: 10, step: .1, default: 1 },
      { key: 'frictionSeconds', label: '마찰 지속 시간 (초)', type: 'number', min: 0, max: 30, step: .1, default: 0 },
      { key: 'revealFog', label: '안개 해제', type: 'boolean', default: false },
      { key: 'dialogueWhen', label: '대사 출력 시점', type: 'select', options: [
        { value: 'collect', label: '획득 즉시' }, { value: 'resting', label: '스톤 정지 후' }
      ], default: 'collect' }
    ] }
  ];
  return { triggers, actions, comparators, mechanics, variableTypes: ['boolean', 'number', 'string'] };
});
