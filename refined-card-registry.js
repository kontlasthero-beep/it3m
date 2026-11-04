(function (root) {
  'use strict';

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.keys(value).forEach(function (key) {
        deepFreeze(value[key]);
      });
      Object.freeze(value);
    }
    return value;
  }

  const definitions = {
    hardening: {
      id: 'hardening',
      name: '정제된 경질화',
      description: '스톤의 마찰력을 4배로 높입니다.',
      mechanic: { kind: 'friction-multiplier', frictionMultiplier: 4 },
      storyPlaceholder: ''
    },
    brick: {
      id: 'brick',
      name: '정제된 구조물 투하',
      description: '배치하는 가벽의 전체 크기가 1.5배 증가합니다.',
      mechanic: { kind: 'structure-size-multiplier', sizeMultiplier: 1.5 },
      storyPlaceholder: ''
    },
    reposition: {
      id: 'reposition',
      name: '정제된 재배치',
      description: '재발사 파워를 30%, 50%, 70%, 100% 중 하나로 고른 뒤 발사합니다. 파워 미터는 사용하지 않습니다.',
      mechanic: { kind: 'preset-relaunch-power', powers: [0.3, 0.5, 0.7, 1], skipPowerMeter: true },
      storyPlaceholder: ''
    },
    ammo: {
      id: 'ammo',
      name: '정제된 총알 장전',
      description: '위력이 50% 감소한 총알 세 발을 부채꼴로 발사합니다.',
      mechanic: { kind: 'fan-bullets', bulletCount: 3, powerMultiplier: 0.5, pattern: 'fan' },
      storyPlaceholder: ''
    },
    'data-barrier': {
      id: 'data-barrier',
      name: '정제된 데이터 장벽',
      description: '데이터 장벽이 사라지지 않습니다.',
      mechanic: { kind: 'permanent-data-barrier', permanent: true },
      storyPlaceholder: ''
    },
    bluffing: {
      id: 'bluffing',
      name: '정제된 속임수',
      description: '방출과 블랙홀 방출의 영향을 받지 않습니다.',
      mechanic: { kind: 'effect-immunity', immuneTo: ['pulse', 'blackhole'] },
      storyPlaceholder: ''
    },
    escape: {
      id: 'escape',
      name: '정제된 탈출',
      description: '스톤을 탈출 대기 상태로 만듭니다. 충돌, 총알, 방출 또는 블랙홀 방출로 움직이면 스톤이 추락 판정 없이 제거되고 10점을 얻습니다.',
      mechanic: {
        kind: 'escape-on-movement',
        state: 'escape-pending',
        movementCauses: ['collision', 'bullet', 'pulse', 'blackhole'],
        removeWithoutFall: true,
        scoreOnRemoval: 10
      },
      storyPlaceholder: ''
    },
    guard: {
      id: 'guard',
      name: '정제된 방호벽',
      description: '두 위성체가 나란히 회전하며, 속도가 빠르고 느리게 반복해 변합니다. 평균 회전 속도는 기존보다 50% 빠릅니다.',
      mechanic: { kind: 'synchronized-oscillating-orbit-speed', averageOrbitSpeedMultiplier: 1.5, smoothSpeedVariation: true },
      storyPlaceholder: ''
    },
    blackhole: {
      id: 'blackhole',
      name: '정제된 블랙홀 방출',
      description: '스톤을 블랙홀 충전 상태로 만듭니다. 드래그 반대 방향의 부채꼴 범위에서 스톤과 유닛을 끌어당깁니다. 사거리가 35% 증가하며, 끌어당기는 동안 자신의 스톤은 충돌을 무시하고 총알 장전을 사용할 수 없습니다.',
      mechanic: {
        kind: 'charged-directional-pull',
        activation: 'charged-stone',
        pullShape: 'fan',
        pullDirection: 'opposite-drag',
        rangeMultiplier: 1.35,
        ownStoneCollisionlessWhileChanneling: true,
        ammoUnavailableWhileChanneling: true
      },
      storyPlaceholder: ''
    },
    pulse: {
      id: 'pulse',
      name: '정제된 방출',
      description: '영향을 받은 상대 스톤은 경질화, 첫 스톤, 빅보이 효과 등 외부에서 추가된 마찰력의 영향을 받지 않습니다.',
      mechanic: {
        kind: 'ignore-external-friction',
        target: 'opponent-stones',
        ignoredSources: ['hardening', 'first-stone', 'big-boy']
      },
      storyPlaceholder: ''
    },
    'repulsion-field': {
      id: 'repulsion-field',
      name: '정제된 반발장',
      description: '대상의 크기를 30% 증가시킵니다.',
      mechanic: { kind: 'target-size-multiplier', sizeMultiplier: 1.3 },
      storyPlaceholder: ''
    }
  };

  root.SecondChanceRefinedCardDefinitions = deepFreeze(definitions);
})(typeof window === 'object' ? window : globalThis);
