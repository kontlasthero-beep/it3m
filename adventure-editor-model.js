(function (root, factory) {
  const model = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.SecondChanceEditor = model;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  const BOARD = Object.freeze({ width: 1200, height: 772 });
  const TABLE = Object.freeze({ left: 88, right: 1112, top: 68, bottom: 662 });
  const MIN_PLAY_SIZE = 80;
  const MAPS = Object.freeze({
    classic: { label: '기본 맵', src: 'in-game-screen/curling-table-maps/classic/background-concept.png', crop: { x: .042, y: .089, width: .90, height: .78 } },
    ice: { label: '얼음판 맵', src: 'in-game-screen/curling-table-maps/ice/background-concept.png', crop: { x: .03, y: .08, width: .94, height: .81 } },
    'moving-walls': { label: '구조물 맵', src: 'in-game-screen/curling-table-maps/moving-walls/background-concept.png', crop: { x: .03, y: .10, width: .94, height: .79 } },
    items: { label: '아이템 맵', src: 'in-game-screen/curling-table-maps/classic/background-concept.png', crop: { x: .042, y: .089, width: .90, height: .78 } }
  });
  const KINDS = Object.freeze(['stone', 'structure', 'trigger', 'decoration', 'zone', 'note']);
  const OWNERS = Object.freeze(['neutral', 'player', 'opponent']);
  const OBJECTIVES = Object.freeze(['custom', 'reach-score', 'knockout', 'reach-zone', 'survive', 'collect-trigger']);
  const DIALOGUE_CUES = Object.freeze(['intro', 'success', 'failure', 'event']);
  const IMAGE_CATEGORIES = Object.freeze(['stone', 'structure', 'trigger', 'beacon', 'wire', 'card', 'portrait', 'map', 'decoration']);
  const loadoutModel = typeof module === 'object' && module.exports ? require('./adventure-loadout') : root.SecondChanceAdventureLoadout;
  const eventCatalog = typeof module === 'object' && module.exports ? require('./adventure-event-catalog') : root.SecondChanceAdventureEvents;
  const marksModel = typeof module === 'object' && module.exports ? require('./adventure-marks') : root.SecondChanceAdventureMarks;
  const dialoguePresentation = typeof module === 'object' && module.exports ? require('./adventure-dialogue-presentation') : root.SecondChanceDialoguePresentation;

  function createStage(id = `stage-${Date.now()}`) {
    return {
      format: 'second-chance-adventure-stage', version: 1, id,
      title: '새 스테이지', subtitle: '', mapId: 'classic', backgroundAssetId: null,
      fallBounds: { ...TABLE },
      briefing: '', designerNotes: '',
      objective: { type: 'custom', target: '', turnLimit: 1, notes: '' },
      loadout: loadoutModel.createLoadout(), explorationMarks: marksModel.createConfig(),
      dialogue: [], assets: [], objects: [], variables: [], events: []
    };
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function pointOnBoard(x, y) {
    return { x: clamp(Number(x) || 0, 0, BOARD.width), y: clamp(Number(y) || 0, 0, BOARD.height) };
  }

  function isWithinPlayArea(x, y, margin = 0, bounds = TABLE) {
    return x >= bounds.left + margin && x <= bounds.right - margin &&
      y >= bounds.top + margin && y <= bounds.bottom - margin;
  }

  function normalizeFallBounds(input) {
    const value = key => Number.isFinite(Number(input?.[key])) && input?.[key] !== null && input?.[key] !== ''
      ? Number(input[key]) : TABLE[key];
    const left = clamp(value('left'), 0, BOARD.width - MIN_PLAY_SIZE);
    const top = clamp(value('top'), 0, BOARD.height - MIN_PLAY_SIZE);
    return { left, right: clamp(value('right'), left + MIN_PLAY_SIZE, BOARD.width),
      top, bottom: clamp(value('bottom'), top + MIN_PLAY_SIZE, BOARD.height) };
  }

  function resizeFallBounds(bounds, handle, point, snap = false) {
    const next = { ...normalizeFallBounds(bounds) };
    const coord = value => snap ? Math.round(value / 10) * 10 : Math.round(value);
    if (handle.x === -1) next.left = clamp(coord(point.x), 0, next.right - MIN_PLAY_SIZE);
    if (handle.x === 1) next.right = clamp(coord(point.x), next.left + MIN_PLAY_SIZE, BOARD.width);
    if (handle.y === -1) next.top = clamp(coord(point.y), 0, next.bottom - MIN_PLAY_SIZE);
    if (handle.y === 1) next.bottom = clamp(coord(point.y), next.top + MIN_PLAY_SIZE, BOARD.height);
    return next;
  }

  function resizeFromHandle(object, handle, pointer, snap = false) {
    const angle = object.rotation * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const anchorX = object.x + (-handle.x * object.width / 2) * cos - (-handle.y * object.height / 2) * sin;
    const anchorY = object.y + (-handle.x * object.width / 2) * sin + (-handle.y * object.height / 2) * cos;
    const dx = pointer.x - anchorX, dy = pointer.y - anchorY;
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    const quantize = value => snap ? Math.round(value / 10) * 10 : Math.round(value);
    let width = object.width, height = object.height;
    if (handle.x && handle.y) {
      const projection = (handle.x * localX * width + handle.y * localY * height) / (width * width + height * height);
      const minScale = Math.max(4 / width, 4 / height);
      const maxScale = Math.min(BOARD.width / width, BOARD.height / height);
      const scale = clamp(snap ? quantize(width * projection) / width : projection, minScale, maxScale);
      width = Math.round(width * scale * 100) / 100;
      height = Math.round(height * scale * 100) / 100;
    } else if (handle.x) {
      width = clamp(quantize(handle.x * localX), 4, BOARD.width);
    } else if (handle.y) {
      height = clamp(quantize(handle.y * localY), 4, BOARD.height);
    }
    const center = pointOnBoard(anchorX + (handle.x * width / 2) * cos - (handle.y * height / 2) * sin,
      anchorY + (handle.x * width / 2) * sin + (handle.y * height / 2) * cos);
    return { x: center.x, y: center.y, width, height };
  }

  function orderDialogue(lines) {
    return lines.map((line, index) => ({ line, index,
      priority: Number.isInteger(Number(line?.priority)) && Number(line.priority) > 0 ? Number(line.priority) : index + 1 }))
      .sort((a, b) => a.priority - b.priority || a.index - b.index)
      .map(({ line }, index) => ({ ...line, priority: index + 1 }));
  }

  function moveDialogue(lines, from, to) {
    const ordered = orderDialogue(lines);
    if (!ordered.length || from < 0 || from >= ordered.length) return ordered;
    const [line] = ordered.splice(from, 1);
    ordered.splice(clamp(Math.round(Number(to) || 0), 0, ordered.length), 0, line);
    return ordered.map((item, index) => ({ ...item, priority: index + 1 }));
  }

  function dialogueForCue(stage, cue) {
    if (!DIALOGUE_CUES.includes(cue)) return [];
    return orderDialogue(stage.dialogue || []).filter(line => line.cue === cue && String(line.text || '').trim());
  }

  function variableValue(type, value) {
    if (type === 'boolean') return value === true || value === 'true';
    if (type === 'number') return Number.isFinite(Number(value)) ? Number(value) : 0;
    return String(value ?? '').slice(0, 500);
  }

  function normalizeVariables(input) {
    if (!Array.isArray(input) || input.length > 50) throw new Error('변수 목록이 올바르지 않습니다.');
    const ids = new Set();
    return input.map(variable => {
      if (!variable || typeof variable.id !== 'string' || ids.has(variable.id)) throw new Error('중복되거나 잘못된 변수 ID입니다.');
      ids.add(variable.id);
      const type = eventCatalog.variableTypes.includes(variable.type) ? variable.type : 'boolean';
      return { id: variable.id.slice(0, 100), name: String(variable.name || variable.id).slice(0, 120),
        type, initial: variableValue(type, variable.initial) };
    });
  }

  function normalizeEvents(input) {
    if (!Array.isArray(input) || input.length > 150) throw new Error('연출 목록이 올바르지 않습니다.');
    const ids = new Set();
    return input.map((event, index) => {
      if (!event || typeof event.id !== 'string' || ids.has(event.id)) throw new Error('중복되거나 잘못된 연출 ID입니다.');
      ids.add(event.id);
      const trigger = event.trigger || {};
      if (!eventCatalog.triggers.some(item => item.id === trigger.type)) throw new Error('지원하지 않는 연출 발생 조건입니다.');
      const conditions = Array.isArray(event.conditions) ? event.conditions : [];
      const actions = Array.isArray(event.actions) ? event.actions : [];
      if (conditions.length > 12 || actions.length > 20) throw new Error('연출의 조건 또는 동작이 너무 많습니다.');
      return {
        id: event.id.slice(0, 100), name: String(event.name || `연출 ${index + 1}`).slice(0, 120),
        enabled: event.enabled !== false, priority: clamp(Math.round(Number(event.priority) || index + 1), 1, 999),
        once: event.once !== false,
        trigger: { type: trigger.type, objectId: String(trigger.objectId || '').slice(0, 180),
          cardId: String(trigger.cardId || '').slice(0, 100), variableId: String(trigger.variableId || '').slice(0, 100) },
        conditionMode: event.conditionMode === 'any' ? 'any' : 'all',
        conditions: conditions.map(condition => ({ variableId: String(condition?.variableId || '').slice(0, 100),
          operator: eventCatalog.comparators.some(item => item.id === condition?.operator) ? condition.operator : 'eq',
          value: condition?.value ?? false })),
        actions: actions.map(action => {
          if (!eventCatalog.actions.some(item => item.id === action?.type)) throw new Error('지원하지 않는 연출 동작입니다.');
          return { type: action.type,
          dialogueIds: Array.isArray(action?.dialogueIds) ? action.dialogueIds.map(id => String(id).slice(0, 100)).slice(0, 50) : [],
          assetId: String(action?.assetId || '').slice(0, 180), objectId: String(action?.objectId || '').slice(0, 180),
          variableId: String(action?.variableId || '').slice(0, 100), value: action?.value ?? false,
          amount: Number.isFinite(Number(action?.amount)) ? Number(action.amount) : 0,
          intensity: clamp(Number(action?.intensity) || .4, 0, 1),
          duration: clamp(Number(action?.duration) || .4, 0, 30) };
        })
      };
    });
  }

  function normalizeRuntime(input) {
    if (input == null) return {};
    if (typeof input !== 'object' || Array.isArray(input)) throw new Error('개체의 물리 설정이 올바르지 않습니다.');
    const serialized = JSON.stringify(input);
    if (!serialized || serialized.length > 20000) throw new Error('개체의 물리 설정이 너무 큽니다.');
    const value = JSON.parse(serialized);
    for (const [key, item] of Object.entries(value)) {
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key) ||
          !(item == null || ['number', 'string', 'boolean'].includes(typeof item) ||
            Array.isArray(item) && item.length <= 100 && item.every(entry =>
              entry == null || ['number', 'string', 'boolean'].includes(typeof entry))))
        throw new Error('개체의 물리 설정에 지원하지 않는 값이 있습니다.');
    }
    return value;
  }

  function normalizeStage(input) {
    if (!input || input.format !== 'second-chance-adventure-stage' || input.version !== 1)
      throw new Error('지원하지 않는 스테이지 파일입니다.');
    if (!Array.isArray(input.objects) || !Array.isArray(input.assets) || !Array.isArray(input.dialogue))
      throw new Error('오브젝트·에셋·대사 목록이 올바르지 않습니다.');
    if (input.objects.length > 500 || input.assets.length > 100 || input.dialogue.length > 200)
      throw new Error('스테이지 데이터가 허용 크기를 초과했습니다.');
    const stage = createStage(typeof input.id === 'string' ? input.id.slice(0, 100) : undefined);
    stage.title = String(input.title || stage.title).slice(0, 120);
    stage.subtitle = String(input.subtitle || '').slice(0, 240);
    stage.mapId = MAPS[input.mapId] ? input.mapId : 'classic';
    stage.backgroundAssetId = typeof input.backgroundAssetId === 'string' ? input.backgroundAssetId : null;
    stage.fallBounds = normalizeFallBounds(input.fallBounds);
    stage.briefing = String(input.briefing || '').slice(0, 4000);
    stage.designerNotes = String(input.designerNotes || '').slice(0, 10000);
    const objective = input.objective || {};
    stage.objective = {
      type: OBJECTIVES.includes(objective.type) ? objective.type : 'custom',
      target: String(objective.target ?? '').slice(0, 300),
      turnLimit: clamp(Math.round(Number(objective.turnLimit) || 1), 1, 99),
      notes: String(objective.notes || '').slice(0, 4000)
    };
    stage.loadout = loadoutModel.normalizeLoadout(input.loadout);
    stage.explorationMarks = marksModel.normalizeConfig(input.explorationMarks);
    stage.variables = normalizeVariables(input.variables || []);
    stage.events = normalizeEvents(input.events || []);
    stage.assets = input.assets.map(asset => {
      const bundled = marksModel.EDITOR_ASSETS.some(item => item.src === asset?.src);
      if (!asset || typeof asset.id !== 'string' ||
          !bundled && !/^data:(image\/(png|jpeg|webp)|audio\/(mpeg|wav|ogg));base64,[A-Za-z0-9+/=]+$/.test(asset.dataUrl || ''))
        throw new Error('가져온 에셋의 형식이 올바르지 않습니다.');
      const audio = !bundled && asset.dataUrl.startsWith('data:audio/');
      const category = audio ? 'audio' : IMAGE_CATEGORIES.includes(asset.category) ? asset.category :
        asset.id === stage.backgroundAssetId ? 'map' : 'decoration';
      return { id: asset.id.slice(0, 100), name: String(asset.name || '에셋').slice(0, 120),
        mime: bundled ? 'image/png' : String(asset.mime || '').slice(0, 50),
        ...(bundled ? { src: asset.src } : { dataUrl: asset.dataUrl }), category: bundled ? 'decoration' : category };
    });
    stage.objects = input.objects.map(object => {
      if (!object || typeof object.id !== 'string' || typeof object.assetId !== 'string')
        throw new Error('오브젝트의 ID 또는 에셋 정보가 없습니다.');
      const point = pointOnBoard(object.x, object.y);
      return {
        id: object.id.slice(0, 100), assetId: object.assetId.slice(0, 180),
        kind: KINDS.includes(object.kind) ? object.kind : 'decoration',
        owner: OWNERS.includes(object.owner) ? object.owner : 'neutral',
        x: point.x, y: point.y,
        width: clamp(Number(object.width) || 40, 4, BOARD.width),
        height: clamp(Number(object.height) || 40, 4, BOARD.height),
        rotation: Number.isFinite(Number(object.rotation)) ? ((Number(object.rotation) % 360) + 360) % 360 : 0,
        flipX: object.flipX === true, flipY: object.flipY === true, visible: object.visible !== false,
        groupId: typeof object.groupId === 'string' ? object.groupId.slice(0, 100) : '',
        label: String(object.label || '').slice(0, 120),
        notes: String(object.notes || '').slice(0, 5000),
        mechanicNotes: String(object.mechanicNotes || '').slice(0, 5000),
        runtime: normalizeRuntime(object.runtime)
      };
    });
    stage.dialogue = orderDialogue(input.dialogue.map(line => ({
      id: String(line?.id || '').slice(0, 100),
      cue: DIALOGUE_CUES.includes(line?.cue) ? line.cue : 'intro',
      priority: line?.priority,
      speaker: String(line?.speaker || '').slice(0, 100),
      portraitAssetId: String(line?.portraitAssetId || '').slice(0, 180),
      voiceAssetId: String(line?.voiceAssetId || '').slice(0, 180),
      text: String(line?.text || '').slice(0, 3000),
      presentation: dialoguePresentation.normalize(line?.presentation)
    })));
    if (stage.backgroundAssetId && !stage.assets.some(asset => asset.id === stage.backgroundAssetId))
      stage.backgroundAssetId = null;
    return stage;
  }

  return { BOARD, TABLE, MIN_PLAY_SIZE, MAPS, KINDS, OWNERS, OBJECTIVES, DIALOGUE_CUES, IMAGE_CATEGORIES, createStage, pointOnBoard, isWithinPlayArea,
    normalizeFallBounds, resizeFallBounds, resizeFromHandle,
    orderDialogue, moveDialogue, dialogueForCue, variableValue, normalizeVariables, normalizeEvents, normalizeRuntime, normalizeStage };
});
