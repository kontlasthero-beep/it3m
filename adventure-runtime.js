(function (root, factory) {
  const runtime = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = runtime;
  else root.SecondChanceAdventure = runtime;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  const BOARD = { width: 1200, height: 772 };
  const TABLE = { left: 88, right: 1112, top: 68, bottom: 662 };
  const POWER_ART = Object.freeze({
    beaconOff: 'in-game-screen/game-objects/beacons/pressure-beacon-off.png',
    beaconOn: 'in-game-screen/game-objects/beacons/pressure-beacon-on.png',
    wireOff: 'in-game-screen/game-objects/wires/floor-circuit-straight-off-concept.png',
    wireOn: 'in-game-screen/game-objects/wires/floor-circuit-straight-on-concept.png'
  });
  const loadoutModel = typeof module === 'object' && module.exports ? require('./adventure-loadout') : root.SecondChanceAdventureLoadout;
  const marksModel = typeof module === 'object' && module.exports ? require('./adventure-marks') : root.SecondChanceAdventureMarks;
  const dialoguePresentation = typeof module === 'object' && module.exports ? require('./adventure-dialogue-presentation') : root.SecondChanceDialoguePresentation;

  function prepareStage(stage) {
    if (stage?.format !== 'second-chance-adventure-stage' || stage.version !== 1)
      throw new Error('지원하지 않는 모험 스테이지 파일입니다.');
    if (!Array.isArray(stage.objects) || !Array.isArray(stage.dialogue) || !Array.isArray(stage.assets))
      throw new Error('모험 스테이지의 오브젝트 또는 대사 데이터가 없습니다.');
    const assets = new Map(stage.assets.map(asset => [asset.id, asset]));
    const backgroundSrc = assets.get(stage.backgroundAssetId)?.src || assets.get(stage.backgroundAssetId)?.dataUrl;
    if (stage.backgroundAssetId && !backgroundSrc) throw new Error('스테이지 배경 에셋을 찾을 수 없습니다.');
    const stoneScale = stage.stoneScale ?? 1;
    if (!Number.isFinite(stoneScale) || stoneScale <= 0 || stoneScale > 2)
      throw new Error('스테이지 스톤 크기가 올바르지 않습니다.');
    const barriers = [];
    const props = [];
    const triggers = [];
    const dummies = [];
    const zones = [];
    const beacons = [];
    const wires = [];
    const powerDevices = [];
    let start = null;
    let fog = null;
    for (const object of stage.objects) {
      const { x, y, width, height } = object;
      if (![x, y, width, height, object.rotation].every(Number.isFinite) ||
          x < 0 || x > BOARD.width || y < 0 || y > BOARD.height || width <= 0 || height <= 0)
        throw new Error(`배치 좌표가 올바르지 않습니다: ${object.label || object.id}`);
      const asset = assets.get(object.assetId);
      const beaconArt = object.assetId.startsWith('builtin:pressure-beacon-') || asset?.category === 'beacon';
      const wireArt = object.assetId.startsWith('builtin:floor-wire-') || asset?.category === 'wire';
      if (beaconArt) {
        const conditions = ['powered', 'stone', 'pulse', 'structure'].filter(name =>
          object.runtime?.[`condition${name[0].toUpperCase()}${name.slice(1)}`] === true);
        beacons.push({ id: object.id, x, y, width, height, radius: Math.min(width, height) * .43,
          initialActive: object.runtime?.powerInitialActive === true ||
            object.runtime?.powerInitialActive == null && object.assetId.endsWith('-on'),
          logic: object.runtime?.powerLogic === 'any' ? 'any' : 'all', conditions,
          portMode: ['input', 'output', 'both'].includes(object.runtime?.powerPortMode)
            ? object.runtime.powerPortMode : 'both',
          offSrc: object.assetId.startsWith('builtin:') ? POWER_ART.beaconOff : asset.src || asset.dataUrl,
          onSrc: object.assetId.startsWith('builtin:') ? POWER_ART.beaconOn :
            assets.get(object.runtime?.onAssetId)?.src || assets.get(object.runtime?.onAssetId)?.dataUrl || asset.src || asset.dataUrl });
      } else if (wireArt) {
        const path = object.runtime?.routePoints;
        const coordinates = Array.isArray(path) && path.length >= 4 && path.length % 2 === 0 && path.every(Number.isFinite)
          ? path : [x - width / 2, y, x + width / 2, y];
        const points = [];
        for (let index = 0; index < coordinates.length; index += 2)
          points.push({ x: coordinates[index], y: coordinates[index + 1] });
        wires.push({ id: object.id, points, portMode: ['input', 'output', 'both'].includes(object.runtime?.wirePortMode)
          ? object.runtime.wirePortMode : 'both', collidable: object.runtime?.wireCollidable === true,
          offSrc: POWER_ART.wireOff, onSrc: POWER_ART.wireOn });
      } else if (object.kind === 'structure' && object.assetId === 'builtin:data-barrier') {
        if (object.rotation) throw new Error('회전된 데이터 장벽은 아직 지원하지 않습니다.');
        barriers.push({ id: object.id, x, y, width, height, owner: object.owner === 'opponent' ? 1 : 0 });
      } else if (object.kind === 'structure' && object.assetId === 'builtin:dummy-structure' && object.label === '안개') {
        fog = { id: object.id, x, y, width, height };
      } else if ((object.kind === 'structure' || object.kind === 'decoration') && assets.has(object.assetId)) {
        props.push({ id: object.id, x, y, width, height, rotation: object.rotation,
          flipX: Boolean(object.flipX), flipY: Boolean(object.flipY),
          collidable: object.kind === 'structure',
          src: assets.get(object.assetId).src || assets.get(object.assetId).dataUrl });
        if (object.runtime?.powerReactive === true) powerDevices.push({ id: object.id, x, y,
          radius: Math.min(width, height) / 2, portMode: object.runtime?.powerPortMode || 'input' });
      } else if (object.kind === 'trigger' && object.assetId === 'builtin:dummy-trigger' &&
                 (object.runtime?.mechanicId === 'reposition-trigger' ||
                  object.runtime?.mechanicId == null && object.mechanicNotes?.includes('재배치'))) {
        triggers.push({ id: object.id, x, y, radius: Math.min(width, height) / 2, cardId: 'reposition',
          frictionMultiplier: object.runtime?.frictionMultiplier ?? 1,
          frictionSeconds: object.runtime?.frictionSeconds ?? 0,
          eventDialogueIds: object.runtime?.eventDialogueIds || [],
          dialogueWhen: object.runtime?.dialogueWhen || 'collect',
          revealFog: Boolean(object.runtime?.revealFog) });
      } else if (object.kind === 'stone' && object.assetId === 'builtin:dummy-stone') {
        dummies.push({ id: object.id, x, y, radius: Math.min(width, height) / 2,
          rechargeSeconds: object.runtime?.rechargeSeconds ?? 1.5,
          pulseRadius: object.runtime?.pulseRadius ?? 118,
          pulseImpulseMultiplier: object.runtime?.pulseImpulseMultiplier ?? 1,
          ricochetRestitution: object.runtime?.ricochetRestitution ?? 1,
          velocityMultiplierOnHit: object.runtime?.velocityMultiplierOnHit ?? 1,
          frictionMultiplierOnHit: object.runtime?.frictionMultiplierOnHit ?? 1,
          pulseEffectSeconds: object.runtime?.pulseEffectSeconds ?? .48 });
      } else if (object.kind === 'note' && object.assetId === 'builtin:note' && object.owner === 'player') {
        if (start) throw new Error('스테이지 시작 위치는 하나만 지정할 수 있습니다.');
        start = { x, y };
      } else if (object.kind === 'zone' && object.assetId === 'builtin:zone') {
        zones.push({ id: object.id, x, y, width, height, rotation: object.rotation });
      } else {
        throw new Error(`아직 지원하지 않는 스테이지 오브젝트입니다: ${object.label || object.assetId}`);
      }
    }
    if (zones.length !== 1) throw new Error('첫 스테이지에는 목표 영역이 하나 필요합니다.');
    if (stage.objective?.type !== 'reach-zone' || stage.objective.turnLimit !== 1 || !start)
      throw new Error('첫 스테이지의 목표 또는 턴 제한이 예상과 다릅니다.');
    const fallBounds = stage.fallBounds;
    if (!fallBounds || ![fallBounds.left, fallBounds.right, fallBounds.top, fallBounds.bottom].every(Number.isFinite) ||
      fallBounds.left >= fallBounds.right || fallBounds.top >= fallBounds.bottom)
      throw new Error('스테이지 추락 범위가 올바르지 않습니다.');
    return { id: stage.id, title: stage.title, briefing: stage.briefing, mapId: stage.mapId, stoneScale,
      backgroundSrc, fallBounds, start, barriers, props, triggers, dummies, beacons, wires, powerDevices, fog, goal: zones[0],
      dialogue: stage.dialogue.map(line => ({ ...line, presentation: dialoguePresentation.normalize(line.presentation) })),
      objects: stage.objects, assets: stage.assets, variables: stage.variables || [], events: stage.events || [],
      explorationMarks: marksModel.normalizeConfig(stage.explorationMarks),
      loadout: loadoutModel.normalizeLoadout(stage.loadout) };
  }

  function inGoal(unit, goal) {
    const angle = -(goal.rotation || 0) * Math.PI / 180;
    const dx = unit.x - goal.x;
    const dy = unit.y - goal.y;
    const x = dx * Math.cos(angle) - dy * Math.sin(angle);
    const y = dx * Math.sin(angle) + dy * Math.cos(angle);
    return Math.abs(x) <= goal.width / 2 && Math.abs(y) <= goal.height / 2;
  }

  function stageOutcome({ unit, goal, goalEnabled = true, hasReposition, reaiming, restSeconds = 0 }) {
    if (!unit?.hasLaunched) return null;
    if (unit.status === 'fallen') return 'failure';
    if (goalEnabled && inGoal(unit, goal)) return 'success';
    if (unit.status !== 'resting' || reaiming) return null;
    if (!hasReposition && restSeconds >= 3) return 'failure';
    return null;
  }

  function dialogueFor(stage, cue) {
    return stage.dialogue.filter(line => line.cue === cue && line.text?.trim())
      .sort((a, b) => (a.priority || 0) - (b.priority || 0));
  }

  return { BOARD, TABLE, prepareStage, inGoal, stageOutcome, dialogueFor };
});
