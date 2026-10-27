(function () {
  'use strict';

  const model = window.SecondChanceEditor;
  const { BOARD, TABLE, MAPS, IMAGE_CATEGORIES, createStage, normalizeStage, pointOnBoard, isWithinPlayArea, resizeFallBounds, resizeFromHandle,
    orderDialogue, moveDialogue, dialogueForCue } = model;
  const { CARDS, MAX_CARDS } = window.SecondChanceAdventureLoadout;
  const marks = window.SecondChanceAdventureMarks;
  const dialoguePresentation = window.SecondChanceDialoguePresentation;
  const eventCatalog = window.SecondChanceAdventureEvents;
  const eventEngine = window.SecondChanceAdventureEventEngine;
  function editorStage(input) {
    const normalized = normalizeStage(input);
    normalized.variables = Array.isArray(normalized.variables) ? normalized.variables : Array.isArray(input.variables) ? input.variables : [];
    normalized.events = Array.isArray(normalized.events) ? normalized.events : Array.isArray(input.events) ? input.events : [];
    normalized.explorationMarks = marks.normalizeConfig(input.explorationMarks);
    const originalObjects = new Map((input.objects || []).map(object => [object.id, object]));
    for (const object of normalized.objects) {
      const runtime = object.runtime ?? originalObjects.get(object.id)?.runtime;
      object.runtime = runtime && typeof runtime === 'object' && !Array.isArray(runtime) ? { ...runtime } : {};
    }
    return normalized;
  }
  function newEditorStage(id) { return { ...createStage(id), variables: [], events: [] }; }
  const resizeHandles = [
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 },
    { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
  ];
  const boundaryHandles = [
    { x: -1, y: -1 }, { x: 1, y: -1 }, { x: 1, y: 1 }, { x: -1, y: 1 },
    { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }
  ];
  function resizeCursor(handle) {
    if (!handle.x) return 'ns-resize';
    if (!handle.y) return 'ew-resize';
    return handle.x === handle.y ? 'nwse-resize' : 'nesw-resize';
  }
  const builtins = [
    { id: 'builtin:stone-blue', name: '파란 스톤', category: 'stone', kind: 'stone', owner: 'player', src: 'stone-blue.png', width: 58, height: 58 },
    { id: 'builtin:stone-red', name: '빨간 스톤', category: 'stone', kind: 'stone', owner: 'opponent', src: 'stone-red.png', width: 58, height: 58 },
    { id: 'builtin:dummy-stone', name: '더미 스톤', category: 'stone', kind: 'stone', owner: 'neutral', dummy: true, width: 58, height: 58 },
    { id: 'builtin:brick', name: '벽돌 유닛', category: 'structure', kind: 'structure', owner: 'neutral', width: 18, height: 64 },
    { id: 'builtin:data-barrier', name: '데이터 장벽', category: 'structure', kind: 'structure', owner: 'player', width: 18, height: 64 },
    { id: 'builtin:dummy-structure', name: '더미 구조물', category: 'structure', kind: 'structure', owner: 'neutral', dummy: true, width: 64, height: 64 },
    { id: 'builtin:pressure-beacon-off', name: '압력 비콘', category: 'beacon', kind: 'decoration', owner: 'neutral', src: 'in-game-screen/game-objects/beacons/pressure-beacon-off.png', width: 86, height: 86 },
    { id: 'builtin:floor-wire-off-concept', name: '바닥 전선', category: 'wire', kind: 'decoration', owner: 'neutral', src: 'in-game-screen/game-objects/wires/floor-circuit-straight-off-concept.png', width: 140, height: 46 },
    ...[
      ['blackhole', '블랙홀 방출'], ['pulse', '방출'], ['hardening', '경질화'], ['guard', '방호벽']
    ].map(([id, name]) => ({ id: `builtin:trigger-${id}`, name: `${name} 트리거`, category: 'trigger', kind: 'trigger', owner: 'neutral', src: `Trigger_illustration/v3-simple/${id}.png`, width: 29, height: 29 })),
    { id: 'builtin:dummy-trigger', name: '더미 트리거', category: 'trigger', kind: 'trigger', owner: 'neutral', dummy: true, width: 34, height: 34 },
    ...[
      ['hardening.png', '경질화'], ['Protective barrier.png', '방호벽'], ['release .png', '방출'],
      ['Relocation.png', '재배치'], ['Structure Drop.png', '구조물 투하'], ['blackhole release.png', '블랙홀 방출'],
      ['Load.png', '총알 장전'], ['Bluffing.png', '속임수'], ['Escape.png', '탈출'], ['Data Barrier-v5.png', '데이터 장벽']
    ].map(([file, name]) => ({ id: `builtin:card-${file}`, name, category: 'card', kind: 'decoration', owner: 'neutral', src: `Card_illustration/${file}`, width: 84, height: 110 })),
    ...[
      ['big boy.png', '빅보이'], ['hunter.png', '헌터'], ['trap master.png', '트랩 마스터'], ['joker.png', '조커']
    ].map(([file, name]) => ({ id: `builtin:portrait-${file}`, name, category: 'portrait', kind: 'decoration', owner: 'neutral', src: `영웅 초상화/${file}`, width: 104, height: 122 })),
    { id: 'builtin:background', name: '배경 이미지', category: 'decoration', kind: 'decoration', owner: 'neutral', src: 'Background.png', width: 230, height: 145 },
    { id: 'builtin:note', name: '주석 표식', category: 'decoration', kind: 'note', owner: 'neutral', width: 34, height: 34 },
    { id: 'builtin:zone', name: '목표 영역', category: 'decoration', kind: 'zone', owner: 'neutral', width: 140, height: 95 }
  ];
  const $ = id => document.getElementById(id);
  for (const option of dialoguePresentation.FONT_OPTIONS)
    $('dialoguePreviewFont').add(new Option(option.label, option.id));
  const canvas = $('editorCanvas');
  const ctx = canvas.getContext('2d');
  const imageCache = new Map();
  const power = window.SecondChanceAdventurePower;
  const bundledMarkAssets = marks.EDITOR_ASSETS.map(asset => ({
    id: `upload:bundled:${asset.file.replace(/\.png$/, '')}`, name: asset.name,
    category: 'decoration', kind: 'decoration', owner: 'neutral', src: asset.src,
    width: 90, height: 90, mime: 'image/png', shared: true, bundled: true
  }));
  let sharedAssets = [...bundledMarkAssets];
  let sharedCatalogSignature = '';
  let stage = newEditorStage();
  let selectedId = null;
  const selectedIds = new Set();
  let placementId = null;
  let tool = 'select';
  let inspectorTab = 'stage';
  let selectedDialogueId = null;
  let selectedEventId = null;
  let previewTestedEventId = null;
  let previewTestDialogueIds = [];
  let storyReturnTab = 'stage';
  let previewIndex = 0;
  let previewOverrideLineId = null;
  let previewCurrentLine = null;
  let previewReveal = null;
  let fullPreviewReveal = null;
  let previewReturnFocus = null;
  const previewSoundCache = new Map();
  let drag = null;
  let db = null;
  let autosaveTimer = null;
  const undoStack = [];
  const redoStack = [];

  function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function status(message) { $('boardStatus').textContent = message; }
  function currentObject() { return stage.objects.find(object => object.id === selectedId) || null; }
  function selectedObjects() { return stage.objects.filter(object => selectedIds.has(object.id)); }
  function selectObjects(objects, primary = objects.at(-1)) {
    selectedIds.clear();
    for (const object of objects) selectedIds.add(object.id);
    selectedId = primary?.id || null;
    refreshInspector(); render();
  }
  function selectionFor(object) {
    return object.groupId ? stage.objects.filter(item => item.groupId === object.groupId) : [object];
  }
  function syncSelection() {
    for (const id of selectedIds) if (!stage.objects.some(object => object.id === id)) selectedIds.delete(id);
    if (!selectedIds.has(selectedId)) selectedId = [...selectedIds].at(-1) || null;
  }
  const categoryLabels = { stone: '스톤', structure: '구조물', trigger: '트리거', beacon: '비콘', wire: '전선', card: '카드 삽화', portrait: '초상화', map: '맵 이미지', decoration: '기타 이미지', audio: '오디오' };
  const categoryOrder = Object.keys(categoryLabels);
  function assetById(id) {
    const builtin = builtins.find(asset => asset.id === id);
    if (builtin) return builtin;
    const uploaded = stage.assets.find(asset => asset.id === id);
    if (!uploaded) return null;
    const category = uploaded.category || (uploaded.mime.startsWith('audio/') ? 'audio' : 'decoration');
    const kinds = { stone: 'stone', structure: 'structure', trigger: 'trigger', map: 'map', audio: 'audio' };
    const sizes = { stone: [58, 58], structure: [64, 64], trigger: [34, 34], beacon: [86, 86], wire: [140, 46], card: [84, 110], portrait: [104, 122] };
    const [width, height] = sizes[category] || [90, 90];
    return { ...uploaded, src: uploaded.dataUrl || uploaded.src, category, kind: kinds[category] || 'decoration', owner: 'neutral', width, height };
  }
  function isPowerCategory(object, category) { return assetById(object.assetId)?.category === category; }
  function wirePoints(object) {
    const stored = object.runtime?.routePoints;
    if (Array.isArray(stored) && stored.length >= 4 && stored.length % 2 === 0 && stored.every(Number.isFinite)) {
      const points = [];
      for (let i = 0; i < stored.length; i += 2) points.push({ x: stored[i], y: stored[i + 1] });
      return points;
    }
    return [{ x: object.x - object.width / 2, y: object.y }, { x: object.x + object.width / 2, y: object.y }];
  }
  function setWirePoints(object, points) {
    if (!object.runtime) object.runtime = {};
    object.runtime.routePoints = points.flatMap(point => [Math.round(point.x * 100) / 100, Math.round(point.y * 100) / 100]);
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    object.x = (left + right) / 2; object.y = (top + bottom) / 2;
    object.width = Math.max(12, right - left); object.height = Math.max(12, bottom - top);
  }
  function previewPowerState() {
    if (!power) return { poweredById: new Map(), activeById: new Map() };
    const beacons = stage.objects.filter(object => isPowerCategory(object, 'beacon') && object.visible !== false).map(object => ({
      id: object.id, x: object.x, y: object.y, radius: Math.min(object.width, object.height) * .43,
      initialActive: object.runtime?.powerInitialActive === true,
      logic: object.runtime?.powerLogic === 'any' ? 'any' : 'all',
      conditions: ['powered', 'stone', 'pulse', 'structure'].filter(name =>
        object.runtime?.[`condition${name[0].toUpperCase()}${name.slice(1)}`] === true),
      portMode: object.runtime?.powerPortMode || 'both'
    }));
    const wires = stage.objects.filter(object => isPowerCategory(object, 'wire') && object.visible !== false).map(object => ({
      id: object.id, points: wirePoints(object), portMode: object.runtime?.wirePortMode || 'both'
    }));
    const devices = stage.objects.filter(object => object.kind === 'structure' && object.runtime?.powerReactive === true && object.visible !== false)
      .map(object => ({ id: object.id, x: object.x, y: object.y, radius: Math.min(object.width, object.height) / 2,
        portMode: object.runtime?.powerPortMode || 'input' }));
    const stones = stage.objects.filter(object => object.kind === 'stone' && object.visible !== false)
      .map(object => ({ x: object.x, y: object.y, radius: Math.min(object.width, object.height) / 2 }));
    const structures = stage.objects.filter(object => object.kind === 'structure' && object.visible !== false)
      .map(object => ({ x: object.x, y: object.y, width: object.width, height: object.height }));
    return power.evaluatePowerNetwork({ beacons, wires, devices, stones, structures });
  }
  function removeUploadedAsset(assetId) {
    const asset = stage.assets.find(item => item.id === assetId);
    if (!asset) return;
    const count = stage.objects.filter(item => item.assetId === assetId).length;
    if (!confirm(`${asset.name} 에셋과 배치된 개체 ${count}개를 삭제할까요?`)) return;
    undoStack.length = 0; redoStack.length = 0;
    stage.objects = stage.objects.filter(item => item.assetId !== assetId);
    stage.assets = stage.assets.filter(item => item.id !== assetId);
    if (stage.backgroundAssetId === assetId) stage.backgroundAssetId = null;
    for (const line of stage.dialogue) {
      if (line.portraitAssetId === assetId) line.portraitAssetId = '';
      if (line.voiceAssetId === assetId) line.voiceAssetId = '';
      if (line.presentation?.typingSoundAssetId === assetId) line.presentation.typingSoundAssetId = '';
    }
    for (const event of stage.events) for (const action of event.actions) if (action.assetId === assetId) action.assetId = '';
    syncSelection();
    if (placementId === assetId) { placementId = null; setTool('select'); }
    refreshAll(); scheduleSave();
  }
  function imageFor(src) {
    if (!src) return null;
    if (!imageCache.has(src)) {
      const image = new Image();
      image.onload = render;
      image.onerror = render;
      image.src = src;
      imageCache.set(src, image);
    }
    const image = imageCache.get(src);
    return image.complete && image.naturalWidth ? image : null;
  }
  function drawImage(image, x, y, width, height) {
    if (image) ctx.drawImage(image, x, y, width, height);
  }
  function drawMap() {
    ctx.fillStyle = '#101416';
    ctx.fillRect(0, 0, BOARD.width, BOARD.height);
    if (stage.backgroundAssetId) {
      const background = stage.assets.find(asset => asset.id === stage.backgroundAssetId);
      const image = imageFor(background?.dataUrl || background?.src);
      drawImage(image, 0, 0, BOARD.width, BOARD.height);
      return;
    }
    const config = MAPS[stage.mapId];
    const image = imageFor(config.src);
    if (!image) {
      ctx.fillStyle = '#303d3a';
      ctx.fillRect(TABLE.left, TABLE.top, TABLE.right - TABLE.left, TABLE.bottom - TABLE.top);
      return;
    }
    const width = TABLE.right - TABLE.left;
    const height = TABLE.bottom - TABLE.top;
    const { crop } = config;
    const imageWidth = width / crop.width;
    const imageHeight = height / crop.height;
    const imageTop = TABLE.top - crop.y * imageHeight;
    const sourceLeft = crop.x * image.naturalWidth;
    const sourceMiddle = crop.width * image.naturalWidth;
    const sourceRight = image.naturalWidth - sourceLeft - sourceMiddle;
    ctx.drawImage(image, 0, 0, sourceLeft, image.naturalHeight, 0, imageTop, TABLE.left, imageHeight);
    ctx.drawImage(image, sourceLeft, 0, sourceMiddle, image.naturalHeight, TABLE.left, imageTop, width, imageHeight);
    ctx.drawImage(image, sourceLeft + sourceMiddle, 0, sourceRight, image.naturalHeight, TABLE.right, imageTop, BOARD.width - TABLE.right, imageHeight);
  }
  function drawBoundary() {
    if (!$('boundsToggle').checked) return;
    const bounds = stage.fallBounds;
    ctx.save();
    ctx.fillStyle = 'rgba(4, 10, 11, .27)';
    ctx.fillRect(0, 0, BOARD.width, bounds.top);
    ctx.fillRect(0, bounds.bottom, BOARD.width, BOARD.height - bounds.bottom);
    ctx.fillRect(0, bounds.top, bounds.left, bounds.bottom - bounds.top);
    ctx.fillRect(bounds.right, bounds.top, BOARD.width - bounds.right, bounds.bottom - bounds.top);
    ctx.strokeStyle = 'rgba(241, 190, 103, .9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
    ctx.setLineDash([]);
    ctx.fillStyle = '#f4d6a4';
    ctx.font = '14px "Malgun Gothic", sans-serif';
    ctx.fillText('추락 경계', bounds.left + 10, bounds.top + 22);
    if (tool === 'boundary') {
      ctx.fillStyle = '#102226'; ctx.strokeStyle = '#8de4cd'; ctx.lineWidth = 2;
      for (const handle of boundaryHandles) {
        const x = handle.x === -1 ? bounds.left : handle.x === 1 ? bounds.right : (bounds.left + bounds.right) / 2;
        const y = handle.y === -1 ? bounds.top : handle.y === 1 ? bounds.bottom : (bounds.top + bounds.bottom) / 2;
        ctx.fillRect(x - 6, y - 6, 12, 12); ctx.strokeRect(x - 6, y - 6, 12, 12);
      }
    }
    ctx.restore();
  }
  function drawDummy(asset, width, height) {
    ctx.fillStyle = 'rgba(169, 189, 185, .32)';
    ctx.strokeStyle = '#b7ceca';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    if (asset.category === 'structure') {
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
    } else {
      ctx.beginPath();
      ctx.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      if (asset.category === 'trigger') {
        ctx.beginPath(); ctx.ellipse(0, 0, width / 3, height / 3, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#e4f0ed';
    ctx.font = `700 ${Math.max(12, Math.min(width, height) * .4)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('D', 0, 1);
  }
  function drawSelection(object, handles = true) {
    const w = object.width, h = object.height;
    ctx.strokeStyle = '#11191b'; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = '#ffd38b'; ctx.lineWidth = 1;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    if (!handles) return;
    for (const handle of resizeHandles) {
      const x = handle.x * w / 2, y = handle.y * h / 2;
      ctx.fillStyle = '#11191b'; ctx.fillRect(x - 3, y - 3, 6, 6);
      ctx.fillStyle = '#ffd38b'; ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    ctx.strokeStyle = '#ffd38b'; ctx.beginPath(); ctx.moveTo(w / 2, -h / 2); ctx.lineTo(w / 2, -h / 2 - 20); ctx.stroke();
    ctx.fillStyle = '#11191b'; ctx.beginPath(); ctx.arc(w / 2, -h / 2 - 24, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd38b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w / 2, -h / 2 - 24, 5, 0, Math.PI * 2); ctx.stroke();
  }
  function drawRoutedWire(object, powered) {
    const points = wirePoints(object);
    if (points.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const trace = () => { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); };
    trace(); ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(9, 16, 18, .92)'; ctx.stroke();
    trace(); ctx.lineWidth = 5; ctx.strokeStyle = '#876340'; ctx.stroke();
    trace(); ctx.lineWidth = 2; ctx.strokeStyle = powered ? '#74e8f5' : '#3d4543';
    if (powered) { ctx.shadowColor = '#55dbea'; ctx.shadowBlur = 12; }
    ctx.stroke(); ctx.shadowBlur = 0;
    for (const point of [points[0], points.at(-1)]) {
      ctx.beginPath(); ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = powered ? '#9cf5fa' : '#806445'; ctx.fill();
    }
    ctx.restore();
  }
  function drawObject(object, powerPreview) {
    const asset = assetById(object.assetId);
    if (asset?.category === 'wire') {
      drawRoutedWire(object, powerPreview?.poweredById.get(object.id) === true);
      return;
    }
    ctx.save();
    ctx.translate(object.x, object.y);
    ctx.rotate(object.rotation * Math.PI / 180);
    ctx.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1);
    const w = object.width, h = object.height;
    if (object.kind === 'zone') {
      ctx.fillStyle = 'rgba(95, 204, 166, .22)';
      ctx.strokeStyle = '#93e2c7';
      ctx.lineWidth = 2;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else if (object.kind === 'note') {
      ctx.fillStyle = '#dcb26f';
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#152124'; ctx.font = `700 ${Math.max(12, Math.min(w, h) * .6)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('i', 0, 1);
    } else if (asset?.dummy) {
      drawDummy(asset, w, h);
    } else if (object.assetId === 'builtin:brick' || object.assetId === 'builtin:data-barrier') {
      const barrier = object.assetId === 'builtin:data-barrier';
      ctx.fillStyle = barrier ? (object.owner === 'opponent' ? 'rgba(230, 91, 95, .5)' : 'rgba(86, 213, 211, .5)') : '#99938a';
      ctx.strokeStyle = barrier ? (object.owner === 'opponent' ? '#f28b91' : '#9cece4') : '#cdc4ad';
      ctx.lineWidth = 2;
      ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeRect(-w / 2, -h / 2, w, h);
    } else {
      const beaconPowered = asset?.category === 'beacon' && powerPreview?.activeById.get(object.id) === true;
      const image = imageFor(beaconPowered && object.assetId.startsWith('builtin:')
        ? 'in-game-screen/game-objects/beacons/pressure-beacon-on.png' : asset?.src);
      if (image) {
        // These source images have dark, narrow artwork and substantial transparent space.
        // A canvas shadow follows their painted pixels without changing placement dimensions.
        if (asset.category === 'beacon') {
          ctx.shadowColor = beaconPowered ? 'rgba(104, 232, 222, .85)' : 'rgba(220, 158, 86, .48)';
          ctx.shadowBlur = Math.max(5, Math.min(14, Math.min(w, h) * .22));
        }
        drawImage(image, -w / 2, -h / 2, w, h);
      }
      else { ctx.fillStyle = '#627c78'; ctx.fillRect(-w / 2, -h / 2, w, h); }
    }
    ctx.restore();
  }
  function render() {
    drawMap();
    drawBoundary();
    const powerPreview = previewPowerState();
    for (const object of stage.objects.filter(item => isPowerCategory(item, 'wire'))) drawObject(object, powerPreview);
    for (const object of stage.objects.filter(item => !isPowerCategory(item, 'wire'))) drawObject(object, powerPreview);
    const selected = selectedObjects();
    for (const object of selected) {
      if (isPowerCategory(object, 'wire')) {
        ctx.save();
        for (const [index, point] of wirePoints(object).entries()) {
          ctx.beginPath(); ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#132427'; ctx.fill(); ctx.strokeStyle = index === 0 || index === wirePoints(object).length - 1 ? '#78e4ed' : '#ffd38b';
          ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      ctx.save(); ctx.translate(object.x, object.y); ctx.rotate(object.rotation * Math.PI / 180);
      drawSelection(object, selected.length === 1); ctx.restore();
    }
    if (selected.length > 1) {
      const bounds = selectionBounds(selected);
      ctx.save(); ctx.strokeStyle = '#ffd38b'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
      ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(bounds.right, bounds.top); ctx.lineTo(bounds.right, bounds.top - 20); ctx.stroke();
      ctx.fillStyle = '#11191b'; ctx.beginPath(); ctx.arc(bounds.right, bounds.top - 24, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffd38b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bounds.right, bounds.top - 24, 5, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
    $('objectCount').textContent = `${stage.objects.length}개 배치`;
  }
  function pointFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return pointOnBoard((event.clientX - rect.left) * BOARD.width / rect.width,
      (event.clientY - rect.top) * BOARD.height / rect.height);
  }
  function snapped(value) { return $('snapToggle').checked ? Math.round(value / 10) * 10 : Math.round(value); }
  function boundaryHandleAt(point) {
    const bounds = stage.fallBounds;
    for (const handle of boundaryHandles) {
      const x = handle.x === -1 ? bounds.left : handle.x === 1 ? bounds.right : (bounds.left + bounds.right) / 2;
      const y = handle.y === -1 ? bounds.top : handle.y === 1 ? bounds.bottom : (bounds.top + bounds.bottom) / 2;
      if (Math.hypot(point.x - x, point.y - y) <= 14) return handle;
    }
    if (point.x >= bounds.left && point.x <= bounds.right) {
      if (Math.abs(point.y - bounds.top) <= 8) return { x: 0, y: -1 };
      if (Math.abs(point.y - bounds.bottom) <= 8) return { x: 0, y: 1 };
    }
    if (point.y >= bounds.top && point.y <= bounds.bottom) {
      if (Math.abs(point.x - bounds.left) <= 8) return { x: -1, y: 0 };
      if (Math.abs(point.x - bounds.right) <= 8) return { x: 1, y: 0 };
    }
    return null;
  }
  function selectionBounds(objects) {
    const corners = objects.flatMap(object => {
      const a = object.rotation * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      return [-1, 1].flatMap(x => [-1, 1].map(y => ({
        x: object.x + x * object.width / 2 * c - y * object.height / 2 * s,
        y: object.y + x * object.width / 2 * s + y * object.height / 2 * c
      })));
    });
    return { left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
      top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)) };
  }
  function selectionPivot(objects) {
    const bounds = selectionBounds(objects);
    return { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
  }
  function pointSegmentDistance(point, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
  }
  function wireNodeAt(object, point) {
    if (!object || !isPowerCategory(object, 'wire')) return -1;
    return wirePoints(object).findIndex(node => Math.hypot(node.x - point.x, node.y - point.y) <= 10);
  }
  function wireSegmentAt(object, point) {
    if (!object || !isPowerCategory(object, 'wire')) return -1;
    const points = wirePoints(object);
    for (let index = 0; index < points.length - 1; index++)
      if (pointSegmentDistance(point, points[index], points[index + 1]) <= 9) return index;
    return -1;
  }
  function snapPowerPoint(point, movingObject) {
    const targets = [];
    for (const object of stage.objects) {
      if (object.id === movingObject.id || object.visible === false) continue;
      if (isPowerCategory(object, 'beacon') || object.runtime?.powerReactive) targets.push({ x: object.x, y: object.y });
      else if (isPowerCategory(object, 'wire')) {
        const points = wirePoints(object); targets.push(points[0], points.at(-1));
      }
    }
    let closest = null, distance = 12;
    for (const target of targets) {
      const next = Math.hypot(point.x - target.x, point.y - target.y);
      if (next <= distance) { closest = target; distance = next; }
    }
    return closest || { x: snapped(point.x), y: snapped(point.y) };
  }
  function rotationHandleAt(point) {
    const objects = selectedObjects();
    if (!objects.length) return false;
    if (objects.length > 1) {
      const bounds = selectionBounds(objects);
      return Math.hypot(point.x - bounds.right, point.y - (bounds.top - 24)) <= 12;
    }
    const object = objects[0], angle = -object.rotation * Math.PI / 180;
    if (isPowerCategory(object, 'wire')) return false;
    const dx = point.x - object.x, dy = point.y - object.y;
    const x = dx * Math.cos(angle) - dy * Math.sin(angle);
    const y = dx * Math.sin(angle) + dy * Math.cos(angle);
    return Math.hypot(x - object.width / 2, y + object.height / 2 + 24) <= 12;
  }
  function resizeHandleAt(point, object) {
    if (!object) return null;
    if (isPowerCategory(object, 'wire')) return null;
    const angle = -object.rotation * Math.PI / 180;
    const dx = point.x - object.x, dy = point.y - object.y;
    const x = dx * Math.cos(angle) - dy * Math.sin(angle);
    const y = dx * Math.sin(angle) + dy * Math.cos(angle);
    const tolerance = Math.min(11, Math.max(4, object.width / 2 - 2), Math.max(4, object.height / 2 - 2));
    let nearest = null, nearestDistance = Infinity;
    for (const handle of resizeHandles) {
      const offsetX = x - handle.x * object.width / 2;
      const offsetY = y - handle.y * object.height / 2;
      const distance = Math.hypot(offsetX, offsetY);
      if (distance <= tolerance && distance < nearestDistance) {
        nearest = handle;
        nearestDistance = distance;
      }
    }
    return nearest;
  }
  function hitTest(point) {
    for (let index = stage.objects.length - 1; index >= 0; index--) {
      const object = stage.objects[index];
      if (isPowerCategory(object, 'wire')) {
        if (wireSegmentAt(object, point) !== -1 || wireNodeAt(object, point) !== -1) return object;
        continue;
      }
      const angle = -object.rotation * Math.PI / 180;
      const dx = point.x - object.x, dy = point.y - object.y;
      const x = dx * Math.cos(angle) - dy * Math.sin(angle);
      const y = dx * Math.sin(angle) + dy * Math.cos(angle);
      if (Math.abs(x) <= object.width / 2 + 4 && Math.abs(y) <= object.height / 2 + 4) return object;
    }
    return null;
  }
  function recordUndo() {
    undoStack.push(JSON.stringify({ objects: stage.objects, fallBounds: stage.fallBounds }));
    if (undoStack.length > 30) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify({ objects: stage.objects, fallBounds: stage.fallBounds }));
    const snapshot = JSON.parse(undoStack.pop());
    stage.objects = snapshot.objects; stage.fallBounds = snapshot.fallBounds;
    syncSelection();
    refreshInspector(); refreshStageFields(); render(); scheduleSave();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify({ objects: stage.objects, fallBounds: stage.fallBounds }));
    const snapshot = JSON.parse(redoStack.pop());
    stage.objects = snapshot.objects; stage.fallBounds = snapshot.fallBounds;
    syncSelection();
    refreshInspector(); refreshStageFields(); render(); scheduleSave();
  }
  function place(assetId, point) {
    const asset = assetById(assetId);
    if (!asset || asset.kind === 'audio' || asset.kind === 'map') return;
    recordUndo();
    const object = { id: uid(), assetId, kind: asset.kind, owner: asset.owner,
      x: snapped(point.x), y: snapped(point.y), width: asset.width, height: asset.height,
      rotation: 0, flipX: false, flipY: false, groupId: '', label: asset.name, notes: '', mechanicNotes: '', runtime: {} };
    if (asset.category === 'wire') object.runtime.routePoints = [object.x - object.width / 2, object.y,
      object.x + object.width / 2, object.y];
    stage.objects.push(object);
    selectObjects([object]);
    if (asset.category === 'wire') setTool('select');
    setTab('object'); scheduleSave();
    status(isWithinPlayArea(object.x, object.y, 0, stage.fallBounds) ? '개체 배치됨' : '추락 경계 바깥에 배치됨');
  }
  function flipSelection(axis) {
    const objects = selectedObjects(); if (!objects.length) return;
    recordUndo();
    const pivot = selectionPivot(objects);
    for (const object of objects) {
      if (objects.length > 1) object[axis === 'x' ? 'x' : 'y'] = 2 * pivot[axis] - object[axis];
      if (objects.length > 1) object.rotation = (360 - object.rotation) % 360;
      object[axis === 'x' ? 'flipX' : 'flipY'] = !object[axis === 'x' ? 'flipX' : 'flipY'];
    }
    refreshInspector(); render(); scheduleSave();
  }
  function setTool(next) {
    tool = next;
    canvas.dataset.tool = next;
    for (const [name, button] of [['select', $('selectTool')], ['place', $('placeTool')], ['boundary', $('boundaryTool')]]) {
      button.classList.toggle('selected', name === next);
      button.setAttribute('aria-pressed', name === next ? 'true' : 'false');
    }
  }
  function setTab(next) {
    const wasStory = inspectorTab === 'story';
    if (wasStory && next !== 'story') closeDialoguePreview();
    if (next === 'story' && inspectorTab !== 'story') storyReturnTab = inspectorTab;
    inspectorTab = next;
    document.body.classList.toggle('story-open', next === 'story');
    for (const name of ['stage', 'object', 'story']) {
      $(`${name}Panel`).hidden = name !== next;
      $(`${name}Tab`).classList.toggle('selected', name === next);
      $(`${name}Tab`).setAttribute('aria-selected', name === next ? 'true' : 'false');
    }
    if (next === 'stage') refreshExplorationMarks();
    if (next === 'story') { renderWorkbench(); $('closeStoryButton').focus(); }
    else if (wasStory) $(`${next}Tab`).focus();
  }
  function assetOptions(select, predicate, emptyLabel) {
    const previous = select.value;
    select.replaceChildren(new Option(emptyLabel, ''));
    for (const asset of [...builtins, ...stage.assets]) if (predicate(asset)) select.add(new Option(asset.name, asset.id));
    select.value = previous;
  }
  function refreshInspector() {
    const object = currentObject();
    const count = selectedIds.size;
    $('objectEmpty').hidden = count > 0;
    $('multiSelection').hidden = count < 2;
    $('objectFields').hidden = count !== 1;
    $('selectionCount').textContent = `${count}개 개체 선택됨`;
    $('groupButton').disabled = count < 2 || selectedObjects().every(item => item.groupId && item.groupId === object?.groupId);
    $('ungroupButton').disabled = !selectedObjects().some(item => item.groupId);
    if (!object) { $('objectMechanics').hidden = true; return; }
    $('objectAssetName').textContent = assetById(object.assetId)?.name || '에셋 없음';
    $('objectId').textContent = object.id;
    for (const [field, key] of [['objectLabel', 'label'], ['objectKind', 'kind'], ['objectOwner', 'owner'],
      ['objectX', 'x'], ['objectY', 'y'], ['objectWidth', 'width'], ['objectHeight', 'height'],
      ['objectRotation', 'rotation'], ['objectNotes', 'notes'], ['objectMechanicNotes', 'mechanicNotes']]) $(field).value = object[key];
    const routedWire = isPowerCategory(object, 'wire');
    $('objectRotation').disabled = routedWire;
    $('removeAssetButton').hidden = !object.assetId.startsWith('upload:');
    $('objectEventsButton').textContent = `이 개체의 연출 보기 (${stage.events.filter(event => event.trigger?.objectId === object.id || event.actions?.some(action => action.objectId === object.id)).length})`;
    renderObjectMechanics(object);
  }
  function renderObjectMechanics(object) {
    const config = Array.isArray(eventCatalog.mechanics)
      ? eventCatalog.mechanics.find(item => item.assetId === object.assetId) ||
        eventCatalog.mechanics.find(item => item.category === assetById(object.assetId)?.category)
      : eventCatalog.mechanics?.[object.assetId];
    const rawFields = Array.isArray(config) ? config : config?.fields;
    const fields = Array.isArray(rawFields) ? rawFields : rawFields && typeof rawFields === 'object'
      ? Object.entries(rawFields).map(([key, value]) => ({ key, ...value })) : [];
    const host = $('objectMechanicFields'); host.replaceChildren();
    $('objectMechanics').hidden = !fields.length;
    if (!fields.length) return;
    if (!object.runtime || typeof object.runtime !== 'object') object.runtime = {};
    for (const field of fields) {
      const key = field.key || field.id;
      if (!key || !['number', 'boolean', 'select'].includes(field.type)) continue;
      const label = document.createElement('label'); label.textContent = field.label || key;
      const value = object.runtime[key] ?? field.default ?? field.defaultValue;
      let control;
      if (field.type === 'boolean') {
        label.className = 'workbench-check'; control = document.createElement('input'); control.type = 'checkbox'; control.checked = value === true;
      } else if (field.type === 'select') {
        control = document.createElement('select');
        for (const option of field.options || []) {
          const optionValue = typeof option === 'object' ? option.value ?? option.id : option;
          const optionLabel = typeof option === 'object' ? option.label ?? option.name ?? optionValue : option;
          control.add(new Option(String(optionLabel), String(optionValue)));
        }
        if (value != null && ![...control.options].some(option => option.value === String(value))) control.add(new Option(String(value), String(value)));
        if (value != null) control.value = String(value);
      } else {
        control = document.createElement('input'); control.type = 'number';
        if (field.min != null) control.min = String(field.min);
        if (field.max != null) control.max = String(field.max);
        control.step = String(field.step ?? 'any'); control.value = value ?? '';
      }
      control.dataset.runtimeKey = key;
      control.addEventListener('change', () => {
        if (field.type === 'number' && (control.value === '' || !control.validity.valid)) return;
        recordUndo();
        object.runtime[key] = field.type === 'boolean' ? control.checked : field.type === 'number' ? Number(control.value) : control.value;
        render(); scheduleSave();
      });
      label.append(control); host.append(label);
    }
    if (isPowerCategory(object, 'wire')) {
      const help = document.createElement('p');
      help.textContent = '지도에서 전선의 점을 드래그하세요. 선을 더블클릭하면 꺾임점을 추가하고, 양 끝은 가까운 접점에 붙습니다.';
      host.append(help);
      const add = document.createElement('button'); add.type = 'button'; add.textContent = '꺾임점 추가';
      add.addEventListener('click', () => {
        const points = wirePoints(object), last = points.at(-1), before = points.at(-2);
        recordUndo(); points.splice(points.length - 1, 0, { x: (last.x + before.x) / 2, y: (last.y + before.y) / 2 });
        setWirePoints(object, points); refreshInspector(); render(); scheduleSave();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '마지막 꺾임점 제거';
      remove.disabled = wirePoints(object).length <= 2;
      remove.addEventListener('click', () => {
        const points = wirePoints(object); if (points.length <= 2) return;
        recordUndo(); points.splice(points.length - 2, 1);
        setWirePoints(object, points); refreshInspector(); render(); scheduleSave();
      });
      host.append(add, remove);
    }
  }
  function refreshStageFields() {
    $('stageTitle').value = stage.title;
    $('stageSubtitle').value = stage.subtitle;
    $('mapSelect').value = stage.mapId;
    assetOptions($('backgroundSelect'), asset => asset.dataUrl?.startsWith('data:image/') || asset.src?.startsWith('adventure/reward-icons/'), '기본 맵 사용');
    for (const asset of bundledMarkAssets) if (!stage.assets.some(item => item.id === asset.id))
      $('backgroundSelect').add(new Option(`${asset.name} · 가져오기`, asset.id));
    $('backgroundSelect').value = stage.backgroundAssetId || '';
    refreshFallFields();
    $('stageBriefing').value = stage.briefing;
    $('objectiveType').value = stage.objective.type;
    $('objectiveTarget').value = stage.objective.target;
    $('turnLimit').value = stage.objective.turnLimit;
    $('objectiveNotes').value = stage.objective.notes;
    refreshExplorationMarks();
    $('startingHandMode').value = stage.loadout.startingHand.mode;
    $('startingHandCount').value = stage.loadout.startingHand.drawCount;
    $('startingHandCount').max = stage.loadout.startingHand.cards.length;
    $('deckMode').value = stage.loadout.deck.mode;
    $('deckCardCount').textContent = `${stage.loadout.deck.cards.length}장`;
    renderStageCards('startingHand');
    renderStageCards('deck');
    $('stageNotes').value = stage.designerNotes;
  }
  function refreshExplorationMarks() {
    const config = stage.explorationMarks || marks.createConfig();
    $('explorationIconSet').value = config.iconSet;
    const icon = marks.ICON_SETS[config.iconSet] || marks.ICON_SETS[marks.DEFAULT_ICON_SET];
    $('explorationIconIntact').src = icon.earnedSrc;
    $('explorationIconBroken').src = icon.unearnedSrc;
    document.querySelectorAll('.exploration-bonus-row').forEach((row, index) => {
      const bonus = config.bonus[index];
      const type = bonus?.type || '';
      row.querySelector('.exploration-bonus-type').value = type;
      row.querySelector('.exploration-bonus-card-field').hidden = type !== 'hand-card';
      row.querySelector('.exploration-bonus-count-field').hidden = type !== 'trigger-count';
      row.querySelector('.exploration-bonus-custom').hidden = type !== 'variable';
      row.querySelector('.exploration-bonus-card').value = bonus?.cardId || CARDS[0].id;
      row.querySelector('.exploration-bonus-count').value = bonus?.count ?? 1;
      const variableSelect = row.querySelector('.exploration-bonus-variable');
      variableSelect.replaceChildren(new Option('변수 선택', ''));
      for (const variable of stage.variables) variableSelect.add(new Option(variable.name || variable.id, variable.id));
      variableSelect.value = bonus?.variableId || '';
      row.querySelector('.exploration-bonus-description').value = bonus?.description || '';
      row.querySelector('.exploration-bonus-operator').value = bonus?.operator || 'eq';
      row.querySelector('.exploration-bonus-value').value = bonus?.value ?? 'true';
      row.querySelector('.exploration-bonus-type').disabled = index > config.bonus.length;
    });
  }
  function refreshFallFields() {
    for (const [id, key] of [['fallLeft', 'left'], ['fallRight', 'right'], ['fallTop', 'top'], ['fallBottom', 'bottom']])
      $(id).value = stage.fallBounds[key];
  }
  function renderStageCards(section) {
    const cards = stage.loadout[section].cards;
    const list = $(section === 'startingHand' ? 'startingHandCards' : 'deckCards');
    list.replaceChildren();
    cards.forEach((id, index) => {
      const card = CARDS.find(item => item.id === id);
      const row = document.createElement('div'); row.className = 'stage-card-row';
      const art = document.createElement('img'); art.src = card.art; art.alt = '';
      const name = document.createElement('span'); name.textContent = `${index + 1}. ${card.name}`;
      row.append(art, name);
      for (const [action, label, disabled] of [['up', '위로', index === 0], ['down', '아래로', index === cards.length - 1], ['remove', '삭제', false]]) {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.action = action; button.dataset.index = String(index);
        const required = stage.loadout.startingHand.cards.filter(item => item === id).length;
        const inBag = cards.filter(item => item === id).length;
        const protectedCard = section === 'deck' && action === 'remove' && inBag <= required;
        button.title = protectedCard ? `${card.name}: 시작 손패에서 먼저 빼세요` : `${card.name} ${label}`;
        button.setAttribute('aria-label', button.title);
        button.textContent = { up: '↑', down: '↓', remove: '×' }[action];
        button.disabled = disabled || protectedCard;
        row.append(button);
      }
      list.append(row);
    });
    if (!cards.length) {
      const empty = document.createElement('span'); empty.className = 'empty-stage-cards'; empty.textContent = '카드 없음';
      list.append(empty);
    }
  }
  function renderPalette() {
    const category = $('assetCategory').value;
    const query = $('assetSearch').value.trim().toLocaleLowerCase();
    const assets = [...builtins, ...sharedAssets.filter(asset => !stage.assets.some(item => item.id === asset.id)), ...stage.assets.map(asset => assetById(asset.id))]
      .filter(asset => (category === 'all' || category === asset.category || (category === 'upload' && asset.id.startsWith('upload:') && !asset.shared)) && asset.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));
    const list = $('assetList');
    list.replaceChildren();
    let lastGroup = '';
    for (const asset of assets) {
      const group = category === 'upload' ? 'upload' : asset.category;
      if (group !== lastGroup) {
        const heading = document.createElement('div');
        heading.className = 'asset-section';
        heading.textContent = group === 'upload' ? '업로드 전체' : categoryLabels[group];
        list.append(heading);
        lastGroup = group;
      }
      const row = document.createElement('div'); row.className = 'asset-row';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'asset-button';
      button.classList.toggle('selected', placementId === asset.id && tool === 'place');
      button.title = asset.kind === 'audio' ? `${asset.name} 재생` : asset.kind === 'map' ? `${asset.name} 맵 배경으로 적용` : `${asset.name} 배치`;
      const thumb = asset.category === 'wire' || asset.kind === 'audio' || !asset.src
        ? document.createElement('span') : document.createElement('img');
      if (thumb.tagName === 'IMG') { thumb.src = asset.src; thumb.alt = ''; }
      else { thumb.className = asset.category === 'wire' ? 'wire-thumbnail' : 'asset-icon';
        thumb.textContent = asset.category === 'wire' ? '' : asset.kind === 'audio' ? '♪' : asset.dummy ? 'D' : asset.kind === 'note' ? 'i' : asset.kind === 'zone' ? '□' : '▥'; }
      const label = document.createElement('span'); label.textContent = asset.name;
      button.append(thumb, label);
      button.addEventListener('click', async () => {
        try {
          const chosen = asset.shared ? await importSharedAsset(asset) : asset;
          if (chosen.kind === 'audio') { new Audio(chosen.src).play().catch(() => status('오디오를 재생할 수 없습니다.')); return; }
          if (chosen.kind === 'map' || chosen.category === 'map') { stage.backgroundAssetId = chosen.id; refreshStageFields(); render(); scheduleSave(); status(`${chosen.name} 맵 배경으로 적용됨`); return; }
          placementId = chosen.id; setTool('place'); renderPalette(); status(`${chosen.name} 배치 선택됨`);
        } catch (error) { status(`에셋 가져오기 실패: ${error.message}`); }
      });
      row.append(button);
      if (asset.id.startsWith('upload:') && !asset.shared) {
        row.classList.add('uploaded');
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'asset-remove'; remove.textContent = '×';
        remove.title = `${asset.name} 삭제`;
        remove.addEventListener('click', () => removeUploadedAsset(asset.id));
        row.append(remove);
        if (asset.kind !== 'audio') {
          const select = document.createElement('select'); select.className = 'asset-category-select';
          select.setAttribute('aria-label', `${asset.name} 분류`);
          for (const key of IMAGE_CATEGORIES) select.add(new Option(categoryLabels[key], key));
          select.value = asset.category;
          select.addEventListener('change', () => {
            const stored = stage.assets.find(item => item.id === asset.id);
            stored.category = select.value;
            if (placementId === asset.id && select.value === 'map') { placementId = null; setTool('select'); }
            renderPalette(); scheduleSave(); status(`${asset.name}: ${categoryLabels[select.value]} 분류됨`);
          });
          row.append(select);
        }
      }
      list.append(row);
    }
  }
  function renderDialogue() {
    const list = $('dialogueList');
    list.replaceChildren();
    stage.dialogue.forEach((line, index) => {
      const entry = document.createElement('section'); entry.className = 'dialogue-entry';
      entry.dataset.lineId = line.id;
      entry.tabIndex = 0;
      entry.classList.toggle('selected', line.id === selectedDialogueId);
      entry.addEventListener('click', () => {
        selectedDialogueId = line.id;
        for (const item of list.children) item.classList.toggle('selected', item === entry);
      });
      entry.addEventListener('keydown', event => {
        if (event.target === entry && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); entry.click();
        }
      });
      const header = document.createElement('header');
      const number = document.createElement('span'); number.textContent = `대사 ${String(index + 1).padStart(2, '0')}`;
      const actions = document.createElement('div'); actions.className = 'line-actions';
      for (const [label, target] of [['위로', index - 1], ['아래로', index + 1]]) {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = label === '위로' ? '↑' : '↓'; button.title = label; button.setAttribute('aria-label', `${number.textContent} ${label}`);
        button.disabled = target < 0 || target >= stage.dialogue.length;
        button.addEventListener('click', () => moveLine(line.id, target));
        actions.append(button);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger';
      remove.textContent = '×'; remove.title = '대사 삭제'; remove.setAttribute('aria-label', `${number.textContent} 삭제`);
      remove.addEventListener('click', event => {
        event.stopPropagation();
        stage.dialogue = orderDialogue(stage.dialogue.filter(item => item.id !== line.id));
        for (const event of stage.events) for (const action of event.actions) if (action.type === 'dialogue')
          action.dialogueIds = (action.dialogueIds || []).filter(id => id !== line.id);
        if (selectedDialogueId === line.id) selectedDialogueId = null;
        renderDialogue(); renderWorkbench(); scheduleSave();
      });
      actions.append(remove); header.append(number, actions); entry.append(header);
      const priorityLabel = document.createElement('label'); priorityLabel.className = 'priority-field';
      priorityLabel.textContent = '우선순위';
      const priority = document.createElement('input'); priority.type = 'number'; priority.min = '1';
      priority.max = String(stage.dialogue.length); priority.step = '1'; priority.value = String(line.priority);
      priority.addEventListener('change', () => moveLine(line.id, Number(priority.value) - 1));
      priorityLabel.append(priority); entry.append(priorityLabel);
      const fields = [
        ['시점', 'cue', 'select', [['시작', 'intro'], ['성공', 'success'], ['실패', 'failure'], ['이벤트', 'event']]],
        ['화자', 'speaker', 'input'], ['초상화', 'portraitAssetId', 'portrait'], ['음성', 'voiceAssetId', 'voice'],
        ['대사', 'text', 'textarea']
      ];
      for (const [labelText, key, type, options] of fields) {
        const label = document.createElement('label'); label.textContent = labelText;
        const field = type === 'textarea' ? document.createElement('textarea') :
          ['select', 'portrait', 'voice'].includes(type) ? document.createElement('select') : document.createElement('input');
        if (type === 'textarea') field.rows = 3;
        field.dataset.dialogueField = key;
        if (type === 'select') for (const [name, value] of options) field.add(new Option(name, value));
        if (type === 'portrait') assetOptions(field, asset => asset.category === 'portrait' || asset.dataUrl?.startsWith('data:image/') || asset.src?.startsWith('adventure/reward-icons/'), '초상화 없음');
        if (type === 'voice') assetOptions(field, asset => asset.dataUrl?.startsWith('data:audio/'), '음성 없음');
        field.value = line[key] || '';
        field.addEventListener('input', () => {
          line[key] = field.value;
          if (key === 'cue' || key === 'text' || key === 'speaker') renderDialoguePreview();
          scheduleSave();
        });
        label.append(field); entry.append(label);
      }
      line.presentation = dialoguePresentation.normalize(line.presentation);
      const hint = document.createElement('small'); hint.className = 'presentation-hint';
      hint.textContent = '대사 입력창에서 Enter를 누르면 실제 대화창에서도 줄바꿈됩니다.';
      entry.append(hint);
      const presentationFields = document.createElement('div'); presentationFields.className = 'presentation-fields';
      for (const [labelText, key, type, choices] of [
        ['글꼴', 'font', 'select', dialoguePresentation.FONT_OPTIONS.map(option => [option.label, option.id])],
        ['글자 크기', 'fontSize', 'number'],
        ['등장 효과', 'reveal', 'select', [['즉시', 'instant'], ['타자', 'typewriter'], ['페이드', 'fade']]],
        ['타자 속도 (글자/초)', 'speed', 'number'],
        ['타자 효과음', 'typingSoundAssetId', 'audio']
      ]) {
        const label = document.createElement('label'); label.textContent = labelText;
        const field = document.createElement(type === 'number' ? 'input' : 'select');
        if (type === 'number') {
          field.type = 'number'; field.min = key === 'fontSize' ? '14' : '5'; field.max = key === 'fontSize' ? '28' : '90';
        } else if (type === 'audio') assetOptions(field, asset => asset.dataUrl?.startsWith('data:audio/'), '효과음 없음');
        else for (const [name, value] of choices) field.add(new Option(name, value));
        field.value = line.presentation[key];
        field.dataset.presentationField = key;
        field.addEventListener('change', () => {
          line.presentation[key] = field.value;
          line.presentation = dialoguePresentation.normalize(line.presentation);
          field.value = line.presentation[key];
          renderDialoguePreview(); scheduleSave();
        });
        label.append(field); presentationFields.append(label);
      }
      entry.append(presentationFields);
      const directionLabel = document.createElement('label'); directionLabel.textContent = '연출 메모';
      const direction = document.createElement('textarea'); direction.rows = 2;
      direction.maxLength = 2000; direction.placeholder = '예: 여기서 잠깐 멈추고 다음 문장을 강조';
      direction.value = line.presentation.direction;
      direction.addEventListener('input', () => { line.presentation.direction = direction.value; scheduleSave(); });
      directionLabel.append(direction); entry.append(directionLabel);
      const previewButton = document.createElement('button'); previewButton.type = 'button';
      previewButton.textContent = '이 대사 미리보기';
      previewButton.title = '큰 창에서 대사와 글꼴·등장 효과를 편집하고 미리보기';
      previewButton.addEventListener('click', () => {
        previewOverrideLineId = line.id; renderDialoguePreview(); openDialoguePreview();
      });
      entry.append(previewButton);
      if (line.voiceAssetId) {
        const audio = stage.assets.find(asset => asset.id === line.voiceAssetId);
        if (audio) { const player = document.createElement('audio'); player.controls = true; player.src = audio.dataUrl; entry.append(player); }
      }
      list.append(entry);
    });
    renderDialoguePreview();
  }
  function moveLine(id, target) {
    const index = stage.dialogue.findIndex(line => line.id === id);
    if (index < 0) return;
    stage.dialogue = moveDialogue(stage.dialogue, index, target);
    selectedDialogueId = id;
    renderDialogue(); scheduleSave();
  }
  function previewPortraitSource(assetId) {
    return assetById(assetId)?.src || '영웅 초상화/big boy.png';
  }
  function previewTypingSound(assetId) {
    const source = assetById(assetId)?.src;
    if (!source) return;
    let clip = previewSoundCache.get(source);
    if (!clip) { clip = new Audio(source); clip.volume = .22; previewSoundCache.set(source, clip); }
    if (clip.paused) clip.play().catch(() => {});
  }
  function closeDialoguePreview() {
    fullPreviewReveal?.stop(); fullPreviewReveal = null;
    $('dialoguePreviewOverlay').hidden = true;
    renderDialoguePreview();
    if (previewReturnFocus?.isConnected) previewReturnFocus.focus();
    previewReturnFocus = null;
  }
  function refreshFullDialoguePreview() {
    if (!previewCurrentLine) return;
    const line = previewCurrentLine;
    fullPreviewReveal?.stop();
    const outcome = line.cue === 'success' || line.cue === 'failure';
    $('dialoguePreviewDialog').classList.toggle('outcome', outcome);
    $('dialoguePreviewOutcomeTitle').hidden = !outcome;
    $('dialoguePreviewOutcomeTitle').textContent = line.cue === 'success' ? '스테이지 클리어' : '다시 도전';
    $('dialoguePreviewPortrait').src = previewPortraitSource(line.portraitAssetId);
    $('dialoguePreviewSpeaker').textContent = line.speaker || '화자';
    fullPreviewReveal = dialoguePresentation.presentText($('dialoguePreviewText'), line,
      { onTick: previewTypingSound });
  }
  function openDialoguePreview() {
    if (!previewCurrentLine) return;
    previewReturnFocus = $('dialoguePreviewOverlay').hidden ? document.activeElement : previewReturnFocus;
    const line = previewCurrentLine;
    $('dialoguePreviewOverlay').hidden = false;
    $('dialoguePreviewInput').value = line.text || '';
    for (const [id, key] of [['dialoguePreviewFont', 'font'], ['dialoguePreviewFontSize', 'fontSize'],
      ['dialoguePreviewReveal', 'reveal'], ['dialoguePreviewSpeed', 'speed']]) $(id).value = line.presentation[key];
    refreshFullDialoguePreview();
    $('dialoguePreviewInput').focus();
  }
  function syncInlineDialogueField(selector, value) {
    const entry = [...$('dialogueList').children].find(item => item.dataset.lineId === previewCurrentLine?.id);
    const field = entry?.querySelector(selector);
    if (field) field.value = value;
  }
  function renderDialoguePreview() {
    const event = stage.events.find(item => item.id === $('previewEvent').value);
    const linkedIds = event?.actions.flatMap(action => action.type === 'dialogue' ? action.dialogueIds || [] : []) || [];
    const ids = previewTestedEventId === event?.id ? previewTestDialogueIds : linkedIds;
    const lines = $('previewCue').value === 'event' && event
      ? ids.map(id => stage.dialogue.find(line => line.id === id)).filter(line => line && String(line.text || '').trim())
      : dialogueForCue(stage, $('previewCue').value);
    previewIndex = Math.min(previewIndex, Math.max(0, lines.length - 1));
    const current = previewOverrideLineId
      ? stage.dialogue.find(line => line.id === previewOverrideLineId) : lines[previewIndex];
    previewCurrentLine = current || null;
    previewReveal?.stop(); previewReveal = null;
    const preview = $('previewLine'); preview.replaceChildren();
    if (current) {
      const portrait = document.createElement('img'); portrait.src = previewPortraitSource(current.portraitAssetId); portrait.alt = '';
      const speaker = document.createElement('strong'); speaker.textContent = current.speaker || '화자';
      const text = document.createElement('span');
      preview.append(portrait, speaker, text);
      previewReveal = dialoguePresentation.presentText(text, current, { onTick: previewTypingSound });
    } else preview.textContent = '대사 없음';
    $('previewPosition').textContent = previewOverrideLineId ? '선택한 대사' : `${current ? previewIndex + 1 : 0} / ${lines.length}`;
    $('previewRestart').disabled = !current || !previewOverrideLineId && previewIndex === 0;
    $('previewNext').disabled = !current || !previewOverrideLineId && previewIndex >= lines.length - 1;
    $('previewFullscreenButton').disabled = !current;
  }
  function currentEvent() { return stage.events.find(event => event.id === selectedEventId); }
  function objectLabel(object) { return `${object.label || assetById(object.assetId)?.name || object.kind} · ${object.id.slice(0, 8)}`; }
  function optionField(labelText, value, choices, update, empty = '선택') {
    const label = document.createElement('label'); label.textContent = labelText;
    const select = document.createElement('select'); select.add(new Option(empty, ''));
    for (const [text, id] of choices) select.add(new Option(text, id));
    if (value && !choices.some(([, id]) => id === value)) select.add(new Option(`연결 없음 · ${value}`, value));
    select.value = value || '';
    select.addEventListener('change', () => { update(select.value); scheduleSave(); renderWorkbench(); });
    label.append(select); return label;
  }
  function textField(labelText, value, update, type = 'text') {
    const label = document.createElement('label'); label.textContent = labelText;
    const input = document.createElement('input'); input.type = type; input.value = value ?? '';
    input.addEventListener('input', () => { update(type === 'number' ? Number(input.value) : input.value); scheduleSave(); renderEventList(); });
    label.append(input); return label;
  }
  function checkField(labelText, checked, update) {
    const label = document.createElement('label'); label.className = 'workbench-check';
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = !!checked;
    input.addEventListener('change', () => { update(input.checked); scheduleSave(); renderEventList(); });
    label.append(input, document.createTextNode(labelText)); return label;
  }
  function valueField(labelText, value, type, update) {
    if (type === 'boolean') return checkField(labelText, value === true, update);
    return textField(labelText, value, update, type === 'number' ? 'number' : 'text');
  }
  function objectChoices() { return stage.objects.map(object => [objectLabel(object), object.id]); }
  function variableChoices() { return stage.variables.map(variable => [variable.name || variable.id, variable.id]); }
  function assetChoices(kind) {
    return stage.assets.filter(asset => kind === 'audio' ? asset.mime.startsWith('audio/') : asset.mime.startsWith('image/'))
      .map(asset => [asset.name, asset.id]).concat(kind === 'image' ? sharedAssets.filter(asset => !stage.assets.some(item => item.id === asset.id))
        .map(asset => [`${asset.name} · 가져오기`, asset.id]) : []);
  }
  function renderEventList() {
    const list = $('eventList'); list.replaceChildren();
    for (const event of [...stage.events].sort((a, b) => a.priority - b.priority)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'event-item';
      button.classList.toggle('selected', event.id === selectedEventId);
      button.setAttribute('aria-disabled', event.enabled === false ? 'true' : 'false');
      const title = document.createElement('strong'); title.textContent = event.name || '새 이벤트';
      const trigger = document.createElement('span'); trigger.textContent = eventCatalog.triggers.find(item => item.id === event.trigger?.type)?.label || event.trigger?.type || '조건 없음';
      const info = document.createElement('small'); info.textContent = `우선순위 ${event.priority} · ${event.actions.length}개 동작${event.once ? ' · 한 번' : ''}`;
      button.append(title, trigger, info);
      button.addEventListener('click', () => { selectedEventId = event.id; $('previewEvent').value = event.id; clearEventTest(); renderWorkbench(); });
      list.append(button);
    }
    if (!stage.events.length) list.textContent = '이벤트 없음';
  }
  function renderVariables() {
    const list = $('variableList'); list.replaceChildren();
    for (const variable of stage.variables) {
      const card = document.createElement('div'); card.className = 'variable-card';
      const header = document.createElement('div'); header.className = 'rule-card-header';
      const id = document.createElement('span'); id.textContent = variable.id.slice(0, 8);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '삭제';
      remove.addEventListener('click', () => { stage.variables = stage.variables.filter(item => item.id !== variable.id); renderWorkbench(); scheduleSave(); });
      header.append(id, remove);
      card.append(header, textField('이름', variable.name, value => { variable.name = value; }),
        optionField('종류', variable.type, eventCatalog.variableTypes.map(type => [({ boolean: '참/거짓', number: '숫자', string: '문자' })[type], type]), value => {
          variable.type = value; variable.initial = value === 'boolean' ? false : value === 'number' ? 0 : '';
        }));
      card.append(valueField('초기값', variable.initial, variable.type, value => { variable.initial = value; }));
      list.append(card);
    }
    if (!stage.variables.length) list.textContent = '변수 없음';
  }
  function renderEventEditor() {
    const host = $('eventEditor'); host.replaceChildren();
    const event = currentEvent(); $('deleteEventButton').disabled = !event;
    if (!event) { host.textContent = '이벤트를 선택하세요.'; return; }
    const basic = document.createElement('div'); basic.className = 'workbench-fields';
    basic.append(textField('이름', event.name, value => { event.name = value; }), textField('우선순위', event.priority, value => { event.priority = value; }, 'number'),
      checkField('사용', event.enabled, value => { event.enabled = value; }), checkField('한 번만', event.once, value => { event.once = value; }));
    host.append(basic);
    const trigger = document.createElement('div'); trigger.className = 'rule-card';
    const triggerTitle = document.createElement('div'); triggerTitle.className = 'rule-card-header'; triggerTitle.textContent = '발동'; trigger.append(triggerTitle);
    trigger.append(optionField('시점', event.trigger.type, eventCatalog.triggers.map(item => [item.label, item.id]), value => {
      event.trigger = { type: value, objectId: '', cardId: '', variableId: '' };
    }));
    const triggerMeta = eventCatalog.triggers.find(item => item.id === event.trigger.type);
    if (triggerMeta?.object) trigger.append(optionField('개체', event.trigger.objectId, objectChoices(), value => { event.trigger.objectId = value; }));
    if (triggerMeta?.card) trigger.append(optionField('카드', event.trigger.cardId, CARDS.map(card => [card.name, card.id]), value => { event.trigger.cardId = value; }));
    if (triggerMeta?.variable) trigger.append(optionField('변수', event.trigger.variableId, variableChoices(), value => { event.trigger.variableId = value; }));
    if (triggerMeta?.object && event.trigger.objectId) {
      const jump = document.createElement('button'); jump.type = 'button'; jump.className = 'workbench-link'; jump.textContent = '개체 편집으로 이동';
      jump.addEventListener('click', () => jumpToObject(event.trigger.objectId)); trigger.append(jump);
    }
    host.append(trigger);
    const conditions = document.createElement('div'); conditions.className = 'rule-card'; conditions.dataset.ruleSection = 'conditions';
    const conditionHeader = document.createElement('div'); conditionHeader.className = 'rule-card-header';
    const conditionTitle = document.createElement('strong'); conditionTitle.textContent = '조건';
    const addCondition = document.createElement('button'); addCondition.type = 'button'; addCondition.textContent = '추가';
    addCondition.addEventListener('click', () => { event.conditions.push({ variableId: '', operator: 'eq', value: '' }); renderWorkbench(); scheduleSave(); });
    conditionHeader.append(conditionTitle, addCondition); conditions.append(conditionHeader,
      optionField('조건 결합', event.conditionMode, [['모두', 'all'], ['하나라도', 'any']], value => { event.conditionMode = value; }));
    event.conditions.forEach((condition, index) => {
      const row = document.createElement('div'); row.className = 'rule-card'; row.dataset.conditionIndex = String(index);
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '조건 삭제';
      remove.addEventListener('click', () => { event.conditions.splice(index, 1); renderWorkbench(); scheduleSave(); });
      const variable = stage.variables.find(item => item.id === condition.variableId);
      row.append(optionField('변수', condition.variableId, variableChoices(), value => { condition.variableId = value; }),
        optionField('비교', condition.operator, eventCatalog.comparators.map(item => [item.label, item.id]), value => { condition.operator = value; }),
        valueField('비교값', condition.value, variable?.type || 'string', value => { condition.value = value; }), remove);
      conditions.append(row);
    });
    host.append(conditions);
    const actions = document.createElement('div'); actions.className = 'rule-card'; actions.dataset.ruleSection = 'actions';
    const actionHeader = document.createElement('div'); actionHeader.className = 'rule-card-header';
    const actionTitle = document.createElement('strong'); actionTitle.textContent = '동작';
    const addAction = document.createElement('button'); addAction.type = 'button'; addAction.textContent = '추가';
    addAction.addEventListener('click', () => { event.actions.push({ type: 'dialogue', dialogueIds: [], assetId: '', objectId: '', variableId: '', value: '', amount: 0, intensity: 1, duration: 0.5 }); renderWorkbench(); scheduleSave(); });
    actionHeader.append(actionTitle, addAction); actions.append(actionHeader);
    event.actions.forEach((action, index) => {
      const row = document.createElement('div'); row.className = 'rule-card'; row.dataset.actionIndex = String(index);
      const header = document.createElement('div'); header.className = 'rule-card-header';
      const number = document.createElement('strong'); number.textContent = `동작 ${index + 1}`;
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger'; remove.textContent = '삭제';
      remove.addEventListener('click', () => { event.actions.splice(index, 1); renderWorkbench(); scheduleSave(); });
      header.append(number, remove); row.append(header,
        optionField('종류', action.type, eventCatalog.actions.map(item => [item.label, item.id]), value => { action.type = value; }));
      const meta = eventCatalog.actions.find(item => item.id === action.type);
      if (meta?.dialogue) {
        const label = document.createElement('div'); label.textContent = '대사'; label.className = 'action-list';
        for (const line of stage.dialogue) {
          const checkbox = checkField(`${line.speaker || '화자'} · ${(line.text || '빈 대사').slice(0, 42)}`, (action.dialogueIds || []).includes(line.id), checked => {
            action.dialogueIds = checked ? [...(action.dialogueIds || []), line.id] : (action.dialogueIds || []).filter(id => id !== line.id);
            renderDialoguePreview();
          }); label.append(checkbox);
        }
        const jump = document.createElement('button'); jump.type = 'button'; jump.textContent = '대사 추가';
        jump.addEventListener('click', () => $('addLineButton').click()); label.append(jump); row.append(label);
      }
      if (meta?.asset) row.append(optionField('에셋', action.assetId, assetChoices(meta.asset), value => {
        const shared = sharedAssets.find(asset => asset.id === value);
        if (shared) importSharedAsset(shared).then(() => { action.assetId = value; renderWorkbench(); scheduleSave(); }).catch(error => status(error.message));
        else action.assetId = value;
      }));
      if (meta?.object) row.append(optionField('개체', action.objectId, objectChoices(), value => { action.objectId = value; }));
      if (meta?.variable) {
        row.append(optionField('변수', action.variableId, variableChoices(), value => { action.variableId = value; }));
        const variable = stage.variables.find(item => item.id === action.variableId);
        row.append(action.type === 'add-variable' ? textField('더할 값', action.amount, value => { action.amount = value; }, 'number')
          : valueField('값', action.value, variable?.type || 'string', value => { action.value = value; }));
      }
      if (action.type === 'screen-shake') row.append(textField('강도', action.intensity, value => { action.intensity = value; }, 'number'),
        textField('시간 (초)', action.duration, value => { action.duration = value; }, 'number'));
      if (meta?.object && action.objectId) {
        const jump = document.createElement('button'); jump.type = 'button'; jump.textContent = '개체 편집으로 이동';
        jump.addEventListener('click', () => jumpToObject(action.objectId)); row.append(jump);
      }
      actions.append(row);
    });
    host.append(actions);
  }
  function renderPreviewEvents() {
    const select = $('previewEvent'); const previous = select.value;
    select.replaceChildren(new Option('선택', ''));
    for (const event of stage.events) select.add(new Option(event.name || '새 이벤트', event.id));
    select.value = stage.events.some(event => event.id === previous) ? previous : selectedEventId || '';
    renderDialoguePreview();
  }
  function renderWorkbench() { renderEventList(); renderVariables(); renderEventEditor(); renderPreviewEvents(); }
  function clearEventTest() {
    const hadTest = previewTestedEventId !== null;
    previewTestedEventId = null; previewTestDialogueIds = [];
    $('eventTestResult').textContent = '';
    if (hadTest) renderDialoguePreview();
  }
  function testSelectedEvent() {
    previewOverrideLineId = null;
    const event = stage.events.find(item => item.id === $('previewEvent').value);
    if (!event) { $('eventTestResult').textContent = '이벤트를 선택하세요.'; return; }
    const previewStage = { ...stage, events: [event] };
    const state = eventEngine.createState(previewStage);
    const initialVariables = { ...state.variables };
    const definitions = new Map(stage.variables.map(variable => [variable.id, variable]));
    const checks = (event.conditions || []).map(condition => eventEngine.matchesCondition(condition, state, definitions));
    const passes = !checks.length || (event.conditionMode === 'any' ? checks.some(Boolean) : checks.every(Boolean));
    const signal = { type: event.trigger.type, objectId: event.trigger.objectId,
      cardId: event.trigger.cardId, variableId: event.trigger.variableId };
    const effects = eventEngine.dispatch(previewStage, state, signal);
    previewTestedEventId = event.id;
    previewTestDialogueIds = effects.flatMap(effect => effect.type === 'dialogue' ? effect.dialogueIds || [] : []);
    const lines = [];
    if (event.enabled === false) lines.push('사용 안 함');
    else if (!passes) {
      lines.push('조건 불충족');
      for (let index = 0; index < checks.length; index++) if (!checks[index]) {
        const condition = event.conditions[index];
        const variable = definitions.get(condition.variableId);
        const operator = eventCatalog.comparators.find(item => item.id === condition.operator)?.label || condition.operator;
        lines.push(`${variable?.name || condition.variableId || '변수 없음'}: ${String(initialVariables[condition.variableId] ?? '없음')} ${operator} ${String(condition.value)}`);
      }
    } else {
      lines.push(effects.length ? '발동' : '발동 · 동작 없음');
      for (const effect of effects) {
        const name = eventCatalog.actions.find(item => item.id === effect.type)?.label || effect.type;
        lines.push(name);
      }
      for (const variable of stage.variables) if (initialVariables[variable.id] !== state.variables[variable.id])
        lines.push(`${variable.name || variable.id}: ${String(initialVariables[variable.id])} → ${String(state.variables[variable.id])}`);
    }
    $('eventTestResult').textContent = lines.join('\n');
    $('previewCue').value = 'event'; previewIndex = 0; renderDialoguePreview();
  }
  function jumpToObject(id) {
    const object = stage.objects.find(item => item.id === id); if (!object) return;
    selectObjects([object]); setTab('object');
  }
  function refreshAll() {
    clearEventTest();
    if (!stage.events.some(event => event.id === selectedEventId)) selectedEventId = stage.events[0]?.id || null;
    if (!stage.dialogue.some(line => line.id === selectedDialogueId)) selectedDialogueId = null;
    previewIndex = 0;
    refreshStageFields(); refreshInspector(); renderPalette(); renderDialogue(); renderWorkbench(); render();
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('second-chance-adventure-editor', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('stages', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function transaction(mode, callback) {
    return new Promise((resolve, reject) => {
      if (!db) return reject(new Error('로컬 저장소를 사용할 수 없습니다.'));
      const tx = db.transaction('stages', mode);
      const request = callback(tx.objectStore('stages'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function refreshDrafts() {
    if (!db) return;
    const records = await transaction('readonly', store => store.getAll());
    const select = $('draftSelect'); select.replaceChildren();
    for (const record of records.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))) {
      select.add(new Option(record.title || '새 스테이지', record.id));
    }
    select.value = stage.id;
  }
  async function saveDraft() {
    clearTimeout(autosaveTimer);
    if (!db) { status('로컬 저장 불가 · 내보내기를 사용하세요'); return; }
    try {
      await transaction('readwrite', store => store.put({ ...stage, savedAt: new Date().toISOString() }));
      localStorage.setItem('second-chance-editor-active', stage.id);
      await refreshDrafts();
      status('저장됨');
    } catch (error) { status(`저장 실패: ${error.message}`); }
  }
  function scheduleSave() { clearEventTest(); clearTimeout(autosaveTimer); autosaveTimer = setTimeout(saveDraft, 700); }
  async function loadDraft(id) {
    const record = await transaction('readonly', store => store.get(id));
    if (!record) return;
    stage = editorStage(record);
    selectedId = null; selectedIds.clear(); placementId = null; undoStack.length = 0; redoStack.length = 0;
    setTool('select'); setTab('stage'); refreshAll();
    localStorage.setItem('second-chance-editor-active', stage.id);
    status('스테이지 불러옴');
  }
  function exportStage() {
    const data = editorStage(stage);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${stage.id.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('스테이지 내보냄');
  }
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
  async function loadSharedAssets() {
    const response = await fetch('/api/editor-assets', { cache: 'no-store' });
    if (!response.ok) return;
    const catalog = (await response.json()).assets;
    const signature = JSON.stringify(catalog);
    if (signature === sharedCatalogSignature) return;
    sharedCatalogSignature = signature;
    const sizes = { stone: [58, 58], structure: [64, 64], trigger: [34, 34], beacon: [86, 86], wire: [140, 46], card: [84, 110], portrait: [104, 122], map: [1200, 772] };
    sharedAssets = [...bundledMarkAssets, ...catalog.filter(item =>
      ![...builtins, ...bundledMarkAssets].some(asset => asset.src?.replace(/^\//, '') === item.src.split('?')[0].replace(/^\//, '')))
      .map(item => {
        const [width, height] = sizes[item.category] || [90, 90];
        const kinds = { stone: 'stone', structure: 'structure', trigger: 'trigger', map: 'map' };
        return { ...item, shared: true, kind: kinds[item.category] || 'decoration', owner: 'neutral', width, height };
      })];
    renderPalette();
  }
  async function importSharedAsset(asset) {
    const existing = stage.assets.find(item => item.id === asset.id);
    if (existing) return assetById(existing.id);
    if (stage.assets.length >= 100) throw new Error('에셋은 스테이지당 100개까지 등록할 수 있습니다.');
    if (asset.bundled) {
      stage.assets.push({ id: asset.id, name: asset.name, mime: 'image/png', src: asset.src, category: 'decoration' });
      refreshStageFields(); renderDialogue(); renderPalette(); scheduleSave();
      return assetById(asset.id);
    }
    const response = await fetch(asset.src, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${asset.name} 파일을 읽을 수 없습니다.`);
    const blob = await response.blob();
    const totalBytes = stage.assets.reduce((sum, item) => sum + Math.floor((item.dataUrl?.split(',')[1]?.length || 0) * .75), 0);
    if (blob.size > 15 * 1024 * 1024 || totalBytes + blob.size > 35 * 1024 * 1024)
      throw new Error('에셋 용량 제한을 초과했습니다.');
    const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[asset.src.split('?')[0].split('.').pop().toLowerCase()];
    stage.assets.push({ id: asset.id, name: asset.name, mime, dataUrl: await readFile(blob), category: asset.category });
    refreshStageFields(); renderDialogue(); renderPalette(); scheduleSave();
    return assetById(asset.id);
  }
  async function uploadAssets(files, category = $('uploadCategory').value) {
    const supported = new Set(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'audio/ogg']);
    let totalBytes = stage.assets.reduce((sum, asset) => sum + Math.floor((asset.dataUrl?.split(',')[1]?.length || 0) * .75), 0);
    const added = [];
    for (const file of files) {
      const extension = file.name.split('.').pop().toLowerCase();
      const mime = supported.has(file.type) ? file.type : ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' })[extension];
      if (!mime) { status(`${file.name}: 지원하지 않는 형식`); continue; }
      if (file.size > 15 * 1024 * 1024) { status(`${file.name}: 15MB 초과`); continue; }
      if (totalBytes + file.size > 35 * 1024 * 1024) { status('업로드 에셋 합계는 35MB까지입니다.'); break; }
      if (stage.assets.length >= 100) { status('에셋은 스테이지당 100개까지 등록할 수 있습니다.'); break; }
      const dataUrl = (await readFile(file)).replace(/^data:[^;]*;base64,/, `data:${mime};base64,`);
      const asset = { id: `upload:${uid()}`, name: file.name, mime, dataUrl,
        category: mime.startsWith('audio/') ? 'audio' : IMAGE_CATEGORIES.includes(category) ? category : 'decoration' };
      stage.assets.push(asset);
      added.push(asset);
      totalBytes += file.size;
      if (asset.category === 'map' && !stage.backgroundAssetId) stage.backgroundAssetId = asset.id;
      else if (mime.startsWith('image/') && asset.category !== 'map') { placementId = asset.id; setTool('place'); }
    }
    $('assetCategory').value = category === 'map' ? 'map' : 'upload';
    refreshStageFields(); renderPalette(); renderDialogue(); render(); scheduleSave();
    status(`${added.length}개 에셋 가져옴`);
    return added;
  }
  async function importStage(file) {
    if (file.size > 60 * 1024 * 1024) throw new Error('60MB를 초과한 스테이지 파일입니다.');
    const imported = editorStage(JSON.parse(await file.text()));
    imported.id = `stage-${uid()}`;
    await saveDraft();
    stage = imported; selectedId = null; selectedIds.clear(); placementId = null;
    undoStack.length = 0; redoStack.length = 0;
    setTool('select'); setTab('stage'); refreshAll(); await saveDraft();
    status('스테이지 가져옴');
  }
  function wireFields() {
    for (const row of document.querySelectorAll('.exploration-bonus-row')) {
      const select = row.querySelector('.exploration-bonus-card');
      for (const card of CARDS) select.add(new Option(card.name, card.id));
      const index = Number(row.dataset.bonusIndex);
      row.querySelector('.exploration-bonus-type').addEventListener('change', event => {
        const bonus = stage.explorationMarks.bonus;
        const type = event.target.value;
        if (!type) bonus.splice(index, 1);
        else bonus[index] = type === 'hand-card' ? { type, cardId: CARDS[0].id } :
          type === 'trigger-count' ? { type, count: 1 } :
          { type: 'variable', description: '', variableId: '', operator: 'eq', value: 'true' };
        stage.explorationMarks = marks.normalizeConfig(stage.explorationMarks);
        refreshExplorationMarks(); scheduleSave();
      });
      select.addEventListener('change', event => {
        const bonus = stage.explorationMarks.bonus[index];
        if (bonus?.type !== 'hand-card') return;
        bonus.cardId = event.target.value;
        stage.explorationMarks = marks.normalizeConfig(stage.explorationMarks);
        scheduleSave();
      });
      row.querySelector('.exploration-bonus-count').addEventListener('change', event => {
        const bonus = stage.explorationMarks.bonus[index];
        if (bonus?.type !== 'trigger-count') return;
        const count = Number(event.target.value);
        bonus.count = Number.isInteger(count) && count > 0 ? count : 1;
        stage.explorationMarks = marks.normalizeConfig(stage.explorationMarks);
        refreshExplorationMarks(); scheduleSave();
      });
      for (const [selector, key] of [
        ['.exploration-bonus-description', 'description'], ['.exploration-bonus-variable', 'variableId'],
        ['.exploration-bonus-operator', 'operator'], ['.exploration-bonus-value', 'value']
      ]) row.querySelector(selector).addEventListener('change', event => {
        const bonus = stage.explorationMarks.bonus[index];
        if (bonus?.type !== 'variable') return;
        bonus[key] = event.target.value;
        stage.explorationMarks = marks.normalizeConfig(stage.explorationMarks);
        scheduleSave();
      });
    }
    $('markVariableEditorButton').addEventListener('click', () => setTab('story'));
    $('explorationIconSet').addEventListener('change', event => {
      stage.explorationMarks.iconSet = event.target.value;
      stage.explorationMarks = marks.normalizeConfig(stage.explorationMarks);
      refreshExplorationMarks(); scheduleSave();
    });
    for (const [id, path] of [
      ['stageTitle', 'title'], ['stageSubtitle', 'subtitle'], ['stageBriefing', 'briefing'], ['stageNotes', 'designerNotes'],
      ['mapSelect', 'mapId']
    ]) $(id).addEventListener('input', event => {
      stage[path] = event.target.value || (path === 'backgroundAssetId' ? null : '');
      if (path === 'title') refreshDrafts().catch(() => {});
      if (path === 'mapId' || path === 'backgroundAssetId') render();
      scheduleSave();
    });
    $('backgroundSelect').addEventListener('change', async event => {
      const value = event.target.value;
      try {
        const shared = bundledMarkAssets.find(asset => asset.id === value);
        if (shared) await importSharedAsset(shared);
        stage.backgroundAssetId = value || null;
        refreshStageFields(); render(); scheduleSave();
      } catch (error) { status(`배경 에셋 가져오기 실패: ${error.message}`); refreshStageFields(); }
    });
    for (const [id, handle, key] of [
      ['fallLeft', { x: -1, y: 0 }, 'x'], ['fallRight', { x: 1, y: 0 }, 'x'],
      ['fallTop', { x: 0, y: -1 }, 'y'], ['fallBottom', { x: 0, y: 1 }, 'y']
    ]) $(id).addEventListener('change', event => {
      const value = Number(event.target.value);
      if (event.target.value !== '' && Number.isFinite(value)) {
        const next = resizeFallBounds(stage.fallBounds, handle, { [key]: value }, false);
        if (JSON.stringify(next) !== JSON.stringify(stage.fallBounds)) {
          recordUndo(); stage.fallBounds = next; render(); scheduleSave();
        }
      }
      refreshFallFields();
    });
    for (const [id, key] of [['objectiveType', 'type'], ['objectiveTarget', 'target'], ['turnLimit', 'turnLimit'], ['objectiveNotes', 'notes']])
      $(id).addEventListener('input', event => { stage.objective[key] = key === 'turnLimit' ? Number(event.target.value) || 1 : event.target.value; scheduleSave(); });
    for (const [section, modeId, selectId, addId, listId] of [
      ['startingHand', 'startingHandMode', 'startingHandCardSelect', 'addStartingHandCard', 'startingHandCards'],
      ['deck', 'deckMode', 'deckCardSelect', 'addDeckCard', 'deckCards']
    ]) {
      const select = $(selectId);
      for (const card of CARDS) select.add(new Option(card.name, card.id));
      $(modeId).addEventListener('change', event => { stage.loadout[section].mode = event.target.value; scheduleSave(); });
      $(addId).addEventListener('click', () => {
        const cards = stage.loadout[section].cards;
        if (cards.length >= MAX_CARDS) { status(`카드는 목록당 ${MAX_CARDS}장까지 지정할 수 있습니다.`); return; }
        if (section === 'startingHand') {
          const required = cards.filter(id => id === select.value).length + 1;
          const inBag = stage.loadout.deck.cards.filter(id => id === select.value).length;
          if (inBag < required && stage.loadout.deck.cards.length >= MAX_CARDS) {
            status(`가방은 ${MAX_CARDS}장까지 지정할 수 있습니다.`); return;
          }
          if (inBag < required) stage.loadout.deck.cards.push(select.value);
        }
        const countWasFull = stage.loadout.startingHand.drawCount === cards.length;
        cards.push(select.value);
        if (section === 'startingHand' && countWasFull) stage.loadout.startingHand.drawCount = cards.length;
        refreshStageFields(); scheduleSave();
      });
      $(listId).addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const cards = stage.loadout[section].cards;
        const index = Number(button.dataset.index);
        if (index < 0 || index >= cards.length) return;
        if (button.dataset.action === 'remove') {
          if (section === 'deck' && cards.filter(id => id === cards[index]).length <=
              stage.loadout.startingHand.cards.filter(id => id === cards[index]).length) return;
          cards.splice(index, 1);
        }
        else {
          const target = index + (button.dataset.action === 'up' ? -1 : 1);
          if (target < 0 || target >= cards.length) return;
          [cards[index], cards[target]] = [cards[target], cards[index]];
        }
        stage.loadout.startingHand.drawCount = Math.min(stage.loadout.startingHand.drawCount, stage.loadout.startingHand.cards.length);
        refreshStageFields(); scheduleSave();
      });
    }
    $('startingHandCount').addEventListener('change', event => {
      const count = Number(event.target.value);
      stage.loadout.startingHand.drawCount = Math.min(stage.loadout.startingHand.cards.length, Math.max(0, Number.isInteger(count) ? count : 0));
      event.target.value = stage.loadout.startingHand.drawCount;
      scheduleSave();
    });
    for (const [id, key] of [['objectLabel', 'label'], ['objectKind', 'kind'], ['objectOwner', 'owner'],
      ['objectX', 'x'], ['objectY', 'y'], ['objectWidth', 'width'], ['objectHeight', 'height'],
      ['objectRotation', 'rotation'], ['objectNotes', 'notes'], ['objectMechanicNotes', 'mechanicNotes']])
      $(id).addEventListener('input', event => {
        const object = currentObject(); if (!object) return;
        const nextValue = ['x', 'y', 'width', 'height', 'rotation'].includes(key) ? Number(event.target.value) || 0 : event.target.value;
        if (isPowerCategory(object, 'wire') && ['x', 'y', 'width', 'height'].includes(key)) {
          const points = wirePoints(object);
          if (key === 'x' || key === 'y') {
            const delta = nextValue - object[key];
            for (const point of points) point[key] = Math.max(0, Math.min(BOARD[key === 'x' ? 'width' : 'height'], point[key] + delta));
          } else {
            const scale = Math.max(4, nextValue) / object[key];
            const axis = key === 'width' ? 'x' : 'y';
            for (const point of points) point[axis] = object[axis] + (point[axis] - object[axis]) * scale;
          }
          setWirePoints(object, points); render(); scheduleSave(); return;
        }
        object[key] = nextValue;
        if (key === 'x' || key === 'y') { const point = pointOnBoard(object.x, object.y); object.x = point.x; object.y = point.y; }
        if (key === 'width' || key === 'height') object[key] = Math.min(1200, Math.max(4, object[key]));
        render(); scheduleSave();
      });
  }
  function wireEvents() {
    canvas.addEventListener('pointerdown', event => {
      const point = pointFromEvent(event);
      if (tool === 'boundary') {
        const handle = boundaryHandleAt(point);
        if (handle) {
          recordUndo(); drag = { mode: 'boundary', handle };
          canvas.setPointerCapture(event.pointerId); canvas.style.cursor = resizeCursor(handle);
        }
        return;
      }
      if (tool === 'place' && placementId) { place(placementId, point); return; }
      const selectedWire = selectedIds.size === 1 ? currentObject() : null;
      const nodeIndex = wireNodeAt(selectedWire, point);
      if (nodeIndex !== -1) {
        recordUndo(); drag = { mode: 'wire-point', id: selectedWire.id, nodeIndex };
        canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'crosshair'; return;
      }
      if (rotationHandleAt(point)) {
        const objects = selectedObjects();
        const pivot = selectionPivot(objects);
        recordUndo(); drag = { mode: 'rotate', initial: objects.map(item => ({ ...item })), pivot,
          angle: Math.atan2(point.y - pivot.y, point.x - pivot.x) };
        canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grab'; return;
      }
      const selected = selectedIds.size === 1 ? currentObject() : null;
      const handle = resizeHandleAt(point, selected);
      if (handle) {
        recordUndo(); drag = { id: selected.id, mode: 'resize', handle, initial: { ...selected } };
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = resizeCursor(handle);
        return;
      }
      const hit = hitTest(point);
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        if (hit) {
          const members = selectionFor(hit), add = !members.every(item => selectedIds.has(item.id));
          for (const item of members) add ? selectedIds.add(item.id) : selectedIds.delete(item.id);
          selectedId = selectedIds.has(hit.id) ? hit.id : [...selectedIds].at(-1) || null;
        }
        refreshInspector(); render(); return;
      }
      if (hit) {
        if (!selectedIds.has(hit.id)) selectObjects(selectionFor(hit), hit);
        recordUndo(); drag = { mode: 'move', initial: selectedObjects().map(item => ({ ...item,
          runtime: { ...item.runtime, routePoints: item.runtime?.routePoints?.slice() } })), start: point,
          collapseId: selectedIds.size > 1 && !hit.groupId ? hit.id : null, didMove: false };
        canvas.setPointerCapture(event.pointerId); setTab('object');
      } else selectObjects([]);
    });
    canvas.addEventListener('pointermove', event => {
      const point = pointFromEvent(event);
      $('cursorPosition').textContent = `x ${Math.round(point.x)} · y ${Math.round(point.y)}`;
      if (!drag) {
        if (tool === 'boundary') {
          const handle = boundaryHandleAt(point);
          canvas.style.cursor = handle ? resizeCursor(handle) : '';
          return;
        }
        const handle = tool === 'select' && selectedIds.size === 1 ? resizeHandleAt(point, currentObject()) : null;
        canvas.style.cursor = tool === 'select' && rotationHandleAt(point) ? 'grab' : handle ? resizeCursor(handle) : '';
        return;
      }
      if (drag.mode === 'boundary') {
        stage.fallBounds = resizeFallBounds(stage.fallBounds, drag.handle, point, $('snapToggle').checked);
        refreshFallFields(); render(); return;
      }
      if (drag.mode === 'wire-point') {
        const object = stage.objects.find(item => item.id === drag.id); if (!object) return;
        const points = wirePoints(object);
        points[drag.nodeIndex] = drag.nodeIndex === 0 || drag.nodeIndex === points.length - 1
          ? snapPowerPoint(point, object) : { x: snapped(point.x), y: snapped(point.y) };
        setWirePoints(object, points); refreshInspector(); render(); return;
      }
      if (drag.mode === 'resize') {
        const object = stage.objects.find(item => item.id === drag.id); if (!object) return;
        Object.assign(object, resizeFromHandle(drag.initial, drag.handle, point, $('snapToggle').checked));
      } else if (drag.mode === 'rotate') {
        let delta = Math.atan2(point.y - drag.pivot.y, point.x - drag.pivot.x) - drag.angle;
        if ($('snapToggle').checked) delta = Math.round(delta / (Math.PI / 12)) * Math.PI / 12;
        const c = Math.cos(delta), s = Math.sin(delta);
        for (const initial of drag.initial) {
          const object = stage.objects.find(item => item.id === initial.id); if (!object) continue;
          const dx = initial.x - drag.pivot.x, dy = initial.y - drag.pivot.y;
          object.x = drag.pivot.x + dx * c - dy * s;
          object.y = drag.pivot.y + dx * s + dy * c;
          object.rotation = ((initial.rotation + delta * 180 / Math.PI) % 360 + 360) % 360;
        }
      } else if (drag.mode === 'move') {
        let dx = point.x - drag.start.x, dy = point.y - drag.start.y;
        if (Math.hypot(dx, dy) < 2 && !drag.didMove) return;
        drag.didMove = true;
        if ($('snapToggle').checked) { dx = Math.round(dx / 10) * 10; dy = Math.round(dy / 10) * 10; }
        else { dx = Math.round(dx); dy = Math.round(dy); }
        dx = Math.max(-Math.min(...drag.initial.map(item => item.x)), Math.min(BOARD.width - Math.max(...drag.initial.map(item => item.x)), dx));
        dy = Math.max(-Math.min(...drag.initial.map(item => item.y)), Math.min(BOARD.height - Math.max(...drag.initial.map(item => item.y)), dy));
        for (const initial of drag.initial) {
          const object = stage.objects.find(item => item.id === initial.id); if (!object) continue;
          object.x = initial.x + dx; object.y = initial.y + dy;
          if (isPowerCategory(object, 'wire')) {
            const points = wirePoints(initial).map(point => ({ x: point.x + dx, y: point.y + dy }));
            setWirePoints(object, points);
          }
        }
      }
      refreshInspector(); render();
    });
    const stopDrag = () => {
      if (!drag) return;
      if (drag.collapseId && !drag.didMove) {
        const object = stage.objects.find(item => item.id === drag.collapseId);
        if (object) selectObjects([object]);
      }
      drag = null; canvas.style.cursor = ''; scheduleSave();
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('dblclick', event => {
      if (tool !== 'select') return;
      const point = pointFromEvent(event), object = hitTest(point);
      const segment = wireSegmentAt(object, point);
      if (segment === -1) return;
      const points = wirePoints(object);
      recordUndo(); points.splice(segment + 1, 0, { x: snapped(point.x), y: snapped(point.y) });
      setWirePoints(object, points); selectObjects([object]); setTab('object'); scheduleSave();
    });
    $('selectTool').addEventListener('click', () => { setTool('select'); renderPalette(); render(); });
    $('placeTool').addEventListener('click', () => { if (!placementId) placementId = builtins[0].id; setTool('place'); renderPalette(); render(); });
    $('boundaryTool').addEventListener('click', () => {
      $('boundsToggle').checked = true; selectObjects([]); setTool('boundary'); setTab('stage'); renderPalette(); render();
    });
    $('snapToggle').addEventListener('change', render);
    $('boundsToggle').addEventListener('change', () => {
      if (!$('boundsToggle').checked && tool === 'boundary') setTool('select');
      render();
    });
    $('resetBoundaryButton').addEventListener('click', () => {
      if (JSON.stringify(stage.fallBounds) === JSON.stringify(TABLE)) return;
      recordUndo(); stage.fallBounds = { ...TABLE }; refreshFallFields(); render(); scheduleSave();
    });
    $('focusBoardButton').addEventListener('click', () => {
      const focused = document.body.classList.toggle('focus-board');
      $('focusBoardButton').textContent = focused ? '판 축소' : '판 확대';
      $('focusBoardButton').setAttribute('aria-pressed', focused ? 'true' : 'false');
    });
    $('undoButton').addEventListener('click', undo);
    $('redoButton').addEventListener('click', redo);
    $('groupButton').addEventListener('click', () => {
      const objects = selectedObjects(); if (objects.length < 2) return;
      recordUndo(); const groupId = `group:${uid()}`;
      for (const object of objects) object.groupId = groupId;
      refreshInspector(); render(); scheduleSave(); status(`${objects.length}개 개체를 그룹화했습니다.`);
    });
    $('ungroupButton').addEventListener('click', () => {
      const groupIds = new Set(selectedObjects().map(item => item.groupId).filter(Boolean));
      if (!groupIds.size) return;
      recordUndo(); for (const object of stage.objects) if (groupIds.has(object.groupId)) object.groupId = '';
      refreshInspector(); render(); scheduleSave(); status('그룹을 해제했습니다.');
    });
    for (const id of ['flipXButton', 'multiFlipX']) $(id).addEventListener('click', () => flipSelection('x'));
    for (const id of ['flipYButton', 'multiFlipY']) $(id).addEventListener('click', () => flipSelection('y'));
    $('assetCategory').addEventListener('change', renderPalette);
    $('assetSearch').addEventListener('input', renderPalette);
    $('addZoneButton').addEventListener('click', () => { placementId = 'builtin:zone'; setTool('place'); renderPalette(); });
    $('addNoteButton').addEventListener('click', () => { placementId = 'builtin:note'; setTool('place'); renderPalette(); });
    for (const name of ['stage', 'object', 'story']) $(`${name}Tab`).addEventListener('click', () => setTab(name));
    $('closeStoryButton').addEventListener('click', () => setTab(storyReturnTab));
    $('storySaveButton').addEventListener('click', saveDraft);
    $('storyStageButton').addEventListener('click', () => setTab('stage'));
    $('storyObjectButton').addEventListener('click', () => setTab('object'));
    $('objectEventsButton').addEventListener('click', () => {
      const object = currentObject(); if (!object) return;
      selectedEventId = stage.events.find(event => event.trigger?.objectId === object.id || event.actions?.some(action => action.objectId === object.id))?.id || null;
      setTab('story');
    });
    $('addEventButton').addEventListener('click', () => {
      const id = uid();
      stage.events.push({ id, name: '새 이벤트', enabled: true, priority: stage.events.length + 1, once: true,
        trigger: { type: 'stage-start', objectId: '', cardId: '', variableId: '' }, conditionMode: 'all', conditions: [], actions: [] });
      selectedEventId = id; renderWorkbench(); scheduleSave();
    });
    $('deleteEventButton').addEventListener('click', () => {
      stage.events = stage.events.filter(event => event.id !== selectedEventId);
      selectedEventId = stage.events[0]?.id || null; renderWorkbench(); scheduleSave();
    });
    $('addVariableButton').addEventListener('click', () => {
      stage.variables.push({ id: uid(), name: '새 변수', type: 'boolean', initial: false }); renderWorkbench(); scheduleSave();
    });
    $('previewEvent').addEventListener('change', () => { clearEventTest(); previewIndex = 0; renderDialoguePreview(); });
    $('testEventButton').addEventListener('click', testSelectedEvent);
    $('duplicateButton').addEventListener('click', () => {
      const object = currentObject(); if (!object) return;
      recordUndo(); const copy = { ...object, runtime: { ...object.runtime }, id: uid(), groupId: '', x: Math.min(BOARD.width, object.x + 24), y: Math.min(BOARD.height, object.y + 24) };
      stage.objects.push(copy); selectObjects([copy]); scheduleSave();
    });
    $('bringFrontButton').addEventListener('click', () => {
      const object = currentObject(); if (!object) return;
      recordUndo(); stage.objects.splice(stage.objects.indexOf(object), 1); stage.objects.push(object); render(); scheduleSave();
    });
    $('deleteButton').addEventListener('click', () => {
      const object = currentObject(); if (!object) return;
      recordUndo(); stage.objects.splice(stage.objects.indexOf(object), 1); selectObjects([]); scheduleSave();
    });
    $('removeAssetButton').addEventListener('click', () => {
      const object = currentObject(); if (!object || !object.assetId.startsWith('upload:')) return;
      removeUploadedAsset(object.assetId);
    });
    $('addLineButton').addEventListener('click', () => {
      const id = uid();
      stage.dialogue.push({ id, cue: 'intro', priority: stage.dialogue.length + 1,
        speaker: '', portraitAssetId: '', voiceAssetId: '', text: '',
        presentation: dialoguePresentation.normalize() });
      selectedDialogueId = id;
      renderDialogue(); renderWorkbench(); scheduleSave();
    });
    $('previewCue').addEventListener('change', () => { previewOverrideLineId = null; previewIndex = 0; renderDialoguePreview(); });
    $('previewRestart').addEventListener('click', () => { previewOverrideLineId = null; previewIndex = 0; renderDialoguePreview(); });
    $('previewNext').addEventListener('click', () => { previewOverrideLineId = null; previewIndex++; renderDialoguePreview(); });
    $('previewFullscreenButton').addEventListener('click', openDialoguePreview);
    $('dialoguePreviewClose').addEventListener('click', closeDialoguePreview);
    $('dialoguePreviewReplay').addEventListener('click', openDialoguePreview);
    $('dialoguePreviewInput').addEventListener('input', event => {
      if (!previewCurrentLine) return;
      previewCurrentLine.text = event.target.value;
      syncInlineDialogueField('[data-dialogue-field="text"]', event.target.value);
      refreshFullDialoguePreview(); scheduleSave();
    });
    for (const [id, key] of [['dialoguePreviewFont', 'font'], ['dialoguePreviewFontSize', 'fontSize'],
      ['dialoguePreviewReveal', 'reveal'], ['dialoguePreviewSpeed', 'speed']]) {
      $(id).addEventListener('change', event => {
        if (!previewCurrentLine || !event.target.validity.valid) return;
        previewCurrentLine.presentation[key] = event.target.value;
        previewCurrentLine.presentation = dialoguePresentation.normalize(previewCurrentLine.presentation);
        event.target.value = previewCurrentLine.presentation[key];
        syncInlineDialogueField(`[data-presentation-field="${key}"]`, event.target.value);
        refreshFullDialoguePreview(); scheduleSave();
      });
    }
    $('uploadButton').addEventListener('click', () => $('assetFileInput').click());
    $('uploadMapButton').addEventListener('click', () => $('mapFileInput').click());
    $('assetFileInput').addEventListener('change', async event => {
      try { await uploadAssets([...event.target.files]); } catch (error) { status(`업로드 실패: ${error.message}`); }
      event.target.value = '';
    });
    $('mapFileInput').addEventListener('change', async event => {
      try {
        const added = await uploadAssets([...event.target.files], 'map');
        const image = added.find(asset => asset.category === 'map');
        if (image) { stage.backgroundAssetId = image.id; refreshStageFields(); render(); scheduleSave(); }
      } catch (error) { status(`맵 업로드 실패: ${error.message}`); }
      event.target.value = '';
    });
    $('saveButton').addEventListener('click', saveDraft);
    $('deleteStageButton').addEventListener('click', async () => {
      if (!db || !confirm(`「${stage.title}」 초안을 삭제할까요? 이 작업은 되돌릴 수 없습니다.`)) return;
      clearTimeout(autosaveTimer);
      await transaction('readwrite', store => store.delete(stage.id));
      localStorage.removeItem('second-chance-editor-active');
      const remaining = await transaction('readonly', store => store.getAll());
      if (remaining.length) stage = editorStage(remaining[0]);
      else { stage = newEditorStage(`stage-${uid()}`); await saveDraft(); }
      selectedId = null; selectedIds.clear(); placementId = null; undoStack.length = 0; redoStack.length = 0;
      setTool('select'); setTab('stage'); refreshAll(); await refreshDrafts(); status('초안 삭제됨');
    });
    $('newButton').addEventListener('click', async () => {
      await saveDraft(); stage = newEditorStage(`stage-${uid()}`); selectedId = null; selectedIds.clear(); placementId = null;
      undoStack.length = 0; redoStack.length = 0;
      setTool('select'); setTab('stage'); refreshAll(); await saveDraft();
    });
    $('draftSelect').addEventListener('change', event => loadDraft(event.target.value).catch(error => status(error.message)));
    $('exportButton').addEventListener('click', () => { try { exportStage(); } catch (error) { status(error.message); } });
    $('importButton').addEventListener('click', () => $('stageFileInput').click());
    $('stageFileInput').addEventListener('change', async event => {
      try { if (event.target.files[0]) await importStage(event.target.files[0]); }
      catch (error) { status(`가져오기 실패: ${error.message}`); }
      event.target.value = '';
    });
    document.addEventListener('keydown', event => {
      if (inspectorTab === 'story' && event.key === 'Escape') {
        event.preventDefault();
        if (!$('dialoguePreviewOverlay').hidden) closeDialoguePreview();
        else setTab(storyReturnTab);
        return;
      }
      if (inspectorTab === 'story' && event.key === 'Tab') {
        const focusRoot = $('dialoguePreviewOverlay').hidden ? $('storyPanel') : $('dialoguePreviewOverlay');
        const focusable = [...focusRoot.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
          .filter(element => element.getClientRects().length);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (inspectorTab === 'story') return;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (event.ctrlKey && event.key.toLowerCase() === 'z' && !typing) { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if (typing) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.size) {
        event.preventDefault(); recordUndo(); stage.objects = stage.objects.filter(item => !selectedIds.has(item.id));
        selectObjects([]); scheduleSave(); return;
      }
      if (event.key === 'Escape') { selectObjects([]); setTool('select'); renderPalette(); }
      const step = event.shiftKey ? 10 : 1;
      const direction = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
      const objects = selectedObjects();
      if (objects.length && direction) {
        event.preventDefault(); recordUndo();
        for (const object of objects) {
          const point = pointOnBoard(object.x + direction[0], object.y + direction[1]);
          object.x = point.x; object.y = point.y;
        }
        refreshInspector(); render(); scheduleSave();
      }
    });
  }
  async function start() {
    for (const [id, config] of Object.entries(MAPS)) $('mapSelect').add(new Option(config.label, id));
    wireFields(); wireEvents(); setTool('select');
    try {
      db = await openDb();
      const lastId = localStorage.getItem('second-chance-editor-active');
      if (lastId) {
        const record = await transaction('readonly', store => store.get(lastId));
        if (record) stage = editorStage(record);
      }
      await refreshDrafts();
      if (!$('draftSelect').length) await saveDraft();
    } catch (error) { status(`로컬 저장소를 사용할 수 없습니다: ${error.message}`); }
    refreshAll();
    await loadSharedAssets().catch(() => {});
    setInterval(() => { if (!document.hidden) loadSharedAssets().catch(() => {}); }, 10000);
    window.addEventListener('focus', () => loadSharedAssets().catch(() => {}));
  }
  start();
})();
