const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { existsSync, readFileSync } = require('node:fs');

(async () => {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_URL: '', UCC_LOCAL_TEST_LEVEL: '100' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Server exited: ${code}`)));
      server.stdout.once('data', resolve);
    });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/editor.html`);
    await page.locator('#assetCategory').selectOption('decoration');
    for (const name of [
      '탐사 표식 A · 항로 화살촉', '탐사 표식 A · 깨진 항로 화살촉',
      '탐사 표식 B · 탐사 비콘', '탐사 표식 B · 깨진 탐사 비콘',
      '탐사 표식 C · 경로 인장'
    ]) await page.getByRole('button', { name, exact: true }).waitFor();
    const filePage = await context.newPage();
    await filePage.goto(pathToFileURL(path.join(__dirname, '..', 'editor.html')).href);
    await filePage.locator('#assetCategory').selectOption('decoration');
    await filePage.getByRole('button', { name: '탐사 표식 B · 탐사 비콘', exact: true }).click();
    await filePage.locator('#editorCanvas').click({ position: { x: 480, y: 270 } });
    assert.equal(await filePage.locator('#objectCount').textContent(), '1개 배치');
    const packagedId = 'upload:bundled:exploration-mark-b-beacon';
    await filePage.locator('#stageTab').click();
    await filePage.locator('#backgroundSelect').selectOption(packagedId);
    assert.equal(await filePage.locator('#backgroundSelect').inputValue(), packagedId);
    await filePage.locator('#storyTab').click();
    await filePage.locator('#addEventButton').click();
    await filePage.locator('[data-rule-section="actions"]').getByRole('button', { name: '추가', exact: true }).click();
    await filePage.locator('[data-action-index="0"] select').first().selectOption('illustration');
    await filePage.locator('[data-action-index="0"] select').nth(1).selectOption(packagedId);
    assert.equal(await filePage.locator('[data-action-index="0"] select').nth(1).inputValue(), packagedId);
    await filePage.close();
    assert.equal(await page.locator('#objectCount').textContent(), '0개 배치');
    assert.equal(await page.locator('#explorationIconSet').inputValue(), 'beacon');
    await page.locator('#explorationIconSet').selectOption('wayfinder');
    assert.match(await page.locator('#explorationIconIntact').getAttribute('src'), /exploration-mark-a-wayfinder\.png$/);
    await page.locator('.exploration-bonus-row').nth(0).locator('.exploration-bonus-type').selectOption('hand-card');
    await page.locator('.exploration-bonus-row').nth(0).locator('.exploration-bonus-card').selectOption('reposition');
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-type').selectOption('trigger-count');
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-count').fill('2');
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-count').press('Tab');
    if (existsSync(path.join(__dirname, '..', 'World_illustration', 'AAB-humanoid-bust-v3.png'))) {
      await page.locator('#assetCategory').selectOption('portrait');
      await page.getByRole('button', { name: 'AAB-humanoid-bust-v3', exact: true }).waitFor();
    }
    await page.locator('#assetCategory').selectOption('card');
    await page.getByRole('button', { name: 'Data Barrier-v2', exact: true }).click();
    await page.locator('#assetCategory').selectOption('upload');
    await page.getByRole('button', { name: 'Data Barrier-v2', exact: true }).waitFor();
    await page.locator('#startingHandCardSelect').selectOption('ammo');
    await page.locator('#addStartingHandCard').click();
    await page.locator('#startingHandCardSelect').selectOption('guard');
    await page.locator('#addStartingHandCard').click();
    assert.deepEqual(await page.locator('#deckCards .stage-card-row span').allTextContents(),
      ['1. 총알 장전', '2. 방호벽']);
    assert.equal(await page.locator('#deckCards .stage-card-row').first().locator('button[data-action="remove"]').isDisabled(), true);
    await page.locator('#startingHandMode').selectOption('random');
    await page.locator('#startingHandCount').fill('1');
    await page.locator('#startingHandCount').press('Tab');
    await page.locator('#deckCardSelect').selectOption('brick');
    await page.locator('#addDeckCard').click();
    await page.locator('#deckCardSelect').selectOption('pulse');
    await page.locator('#addDeckCard').click();
    await page.locator('#deckCards button[data-action="up"]').last().click();
    await page.locator('#saveButton').click();
    await page.locator('#boardStatus').getByText('저장됨').waitFor();
    await page.reload();
    await page.locator('#startingHandCards .stage-card-row').first().waitFor();
    assert.equal(await page.locator('#explorationIconSet').inputValue(), 'wayfinder');
    assert.equal(await page.locator('.exploration-bonus-row').nth(0).locator('.exploration-bonus-card').inputValue(), 'reposition');
    assert.equal(await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-count').inputValue(), '2');
    assert.equal(await page.locator('#startingHandMode').inputValue(), 'random');
    assert.equal(await page.locator('#startingHandCount').inputValue(), '1');
    assert.deepEqual(await page.locator('#startingHandCards .stage-card-row span').allTextContents(),
      ['1. 총알 장전', '2. 방호벽']);
    assert.deepEqual(await page.locator('#deckCards .stage-card-row span').allTextContents(),
      ['1. 총알 장전', '2. 방호벽', '3. 방출', '4. 구조물 투하']);
    assert.equal(await page.locator('#deckCardCount').textContent(), '4장');
    assert.equal(await page.locator('#deckMode').inputValue(), 'ordered');
    const canvas = page.locator('#editorCanvas');
    const boardPoint = async (x, y) => {
      const box = await canvas.boundingBox();
      return { x: box.x + x * box.width / 1200, y: box.y + y * box.height / 772 };
    };
    await page.getByRole('button', { name: '파란 스톤' }).click();
    let point = await boardPoint(270, 260);
    await page.mouse.click(point.x, point.y);
    await page.getByRole('button', { name: '벽돌 유닛' }).click();
    point = await boardPoint(430, 260);
    await page.mouse.click(point.x, point.y);
    await page.locator('#selectTool').click();
    point = await boardPoint(270, 260);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.down('Shift');
    point = await boardPoint(430, 260);
    await page.mouse.click(point.x, point.y);
    await page.keyboard.up('Shift');
    assert.equal(await page.locator('#selectionCount').textContent(), '2개 개체 선택됨');
    assert.equal(await page.locator('#groupButton').isEnabled(), true);
    await page.locator('#groupButton').click();
    point = await boardPoint(439, 204);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    const rotateTo = await boardPoint(470, 195);
    await page.mouse.move(rotateTo.x, rotateTo.y, { steps: 5 });
    await page.mouse.up();
    await page.locator('#multiFlipX').click();
    await page.locator('#saveButton').click();
    await page.locator('#boardStatus').getByText('저장됨').waitFor();
    const readStage = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('second-chance-adventure-editor', 1);
      request.onsuccess = () => {
        const get = request.result.transaction('stages').objectStore('stages').get(localStorage.getItem('second-chance-editor-active'));
        get.onsuccess = () => resolve(get.result);
        get.onerror = () => reject(get.error);
      };
      request.onerror = () => reject(request.error);
    }));
    const waitForStage = async predicate => {
      for (let attempt = 0; attempt < 40; attempt++) {
        const saved = await readStage();
        if (saved && predicate(saved)) return saved;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      throw new Error('Saved stage did not reach the expected state');
    };
    let stage = await readStage();
    assert.equal(new Set(stage.objects.map(object => object.groupId)).size, 1);
    assert.ok(stage.objects[0].groupId.startsWith('group:'));
    assert.ok(stage.objects.some(object => object.rotation !== 0));
    assert.ok(stage.objects.every(object => object.flipX === true));
    await page.locator('#stageTab').click();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    await page.locator('#mapFileInput').setInputFiles({ name: 'test-map.png', mimeType: 'image/png', buffer: png });
    assert.equal(await page.locator('#assetCategory').inputValue(), 'map');
    assert.equal(await page.locator('#backgroundSelect option:checked').textContent(), 'test-map.png');
    await page.locator('#uploadCategory').selectOption('stone');
    await page.locator('#assetFileInput').setInputFiles({ name: 'test-stone.png', mimeType: 'image/png', buffer: png });
    await page.locator('#assetCategory').selectOption('stone');
    assert.equal(await page.locator('#assetList .asset-category-select').count(), 1);
    await page.locator('#assetList .asset-category-select').selectOption('structure');
    await page.locator('#assetCategory').selectOption('structure');
    assert.equal(await page.locator('#assetList .asset-category-select').inputValue(), 'structure');
    await page.locator('#boardStatus').evaluate(element => { element.textContent = ''; });
    await page.locator('#saveButton').click();
    await page.locator('#boardStatus').getByText('저장됨').waitFor();
    await waitForStage(saved => saved.assets.some(asset => asset.name === 'test-stone.png' && asset.category === 'structure'));
    await page.reload();
    stage = await readStage();
    assert.equal(stage.assets.find(asset => asset.name === 'test-map.png').category, 'map');
    assert.equal(stage.assets.find(asset => asset.name === 'test-stone.png').category, 'structure');
    assert.equal(stage.objects[0].groupId, stage.objects[1].groupId);
    await page.locator('#selectTool').click();
    const before = stage.objects.map(object => ({ x: object.x, y: object.y }));
    point = await boardPoint(before[0].x, before[0].y);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    const moved = await boardPoint(before[0].x + 22, before[0].y + 15);
    await page.mouse.move(moved.x, moved.y, { steps: 3 });
    await page.mouse.up();
    assert.equal(await page.locator('#selectionCount').textContent(), '2개 개체 선택됨');
    await page.locator('#saveButton').click();
    stage = await readStage();
    assert.equal(stage.objects[0].x - before[0].x, stage.objects[1].x - before[1].x);
    assert.equal(stage.objects[0].y - before[0].y, stage.objects[1].y - before[1].y);
    await page.locator('#ungroupButton').click();
    await page.locator('#saveButton').click();
    stage = await readStage();
    assert.ok(stage.objects.every(object => object.groupId === ''));
    await page.evaluate(() => {
      window.SecondChanceAdventureEvents.mechanics = {
        'builtin:stone-blue': { fields: [
          { key: 'pulsePower', label: '방출 강도', type: 'number', default: 1, min: 0, max: 10, step: 0.5 },
          { key: 'pulseEnabled', label: '방출 사용', type: 'boolean', default: false },
          { key: 'pulseStyle', label: '방출 유형', type: 'select', default: 'soft',
            options: [{ value: 'soft', label: '약함' }, { value: 'hard', label: '강함' }] }
        ] }
      };
    });
    point = await boardPoint(stage.objects[0].x, stage.objects[0].y);
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.locator('#objectFields').isVisible(), true);
    await page.locator('[data-runtime-key="pulsePower"]').fill('3');
    await page.locator('[data-runtime-key="pulsePower"]').press('Tab');
    await page.locator('[data-runtime-key="pulseEnabled"]').check();
    await page.locator('[data-runtime-key="pulseStyle"]').selectOption('hard');
    await page.locator('#undoButton').click();
    assert.equal(await page.locator('[data-runtime-key="pulseStyle"]').inputValue(), 'soft');
    await page.locator('#redoButton').click();
    assert.equal(await page.locator('[data-runtime-key="pulseStyle"]').inputValue(), 'hard');
    await page.locator('#saveButton').click();
    stage = await waitForStage(saved => saved.objects[0].runtime?.pulseStyle === 'hard');
    assert.deepEqual(stage.objects[0].runtime, { pulsePower: 3, pulseEnabled: true, pulseStyle: 'hard' });
    await page.locator('#flipYButton').click();
    await page.locator('#saveButton').click();
    stage = await readStage();
    assert.equal(stage.objects[0].flipY, true);
    assert.equal(stage.objects[1].flipY, false);
    await page.locator('#boundaryTool').click();
    const corner = await boardPoint(88, 68);
    await page.mouse.move(corner.x, corner.y);
    await page.mouse.down();
    const edge = await boardPoint(74, 110);
    await page.mouse.move(edge.x, edge.y, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs(Number(await page.locator('#fallLeft').inputValue()) - 74) <= 1);
    assert.ok(Math.abs(Number(await page.locator('#fallTop').inputValue()) - 110) <= 1);
    await page.locator('#fallRight').fill('1130');
    await page.locator('#fallRight').press('Tab');
    await page.locator('#fallBottom').fill('680');
    await page.locator('#fallBottom').press('Tab');
    await page.locator('#saveButton').click();
    stage = await readStage();
    assert.equal(stage.fallBounds.right, 1130);
    assert.equal(stage.fallBounds.bottom, 680);
    await page.locator('#resetBoundaryButton').click();
    assert.equal(await page.locator('#fallTop').inputValue(), '68');
    await page.locator('#undoButton').click();
    assert.equal(await page.locator('#fallBottom').inputValue(), '680');
    await page.locator('#boardStatus').evaluate(element => { element.textContent = ''; });
    await page.locator('#saveButton').click();
    await page.locator('#boardStatus').getByText('저장됨').waitFor();
    await waitForStage(saved => saved.fallBounds.right === 1130 && saved.fallBounds.bottom === 680);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#fallRight').value === '1130');
    assert.equal(await page.locator('#fallRight').inputValue(), '1130');
    assert.equal(await page.locator('#fallBottom').inputValue(), '680');
    await page.locator('#storyTab').click();
    assert.equal(await page.locator('#storyPanel').isVisible(), true);
    assert.equal(await page.locator('#storyPanel').evaluate(element => getComputedStyle(element).position), 'fixed');
    await page.locator('#addVariableButton').click();
    await page.locator('.variable-card input[type="text"]').fill('경고 수치');
    await page.locator('.variable-card select').selectOption('number');
    await page.locator('.variable-card input[type="number"]').fill('2');
    await page.locator('#addEventButton').click();
    await page.locator('#eventEditor input[type="text"]').first().fill('충돌 연출');
    await page.locator('#eventEditor select').first().selectOption('object-collision');
    await page.locator('#eventEditor select').nth(1).selectOption(stage.objects[0].id);
    await page.locator('[data-rule-section="conditions"]').getByRole('button', { name: '추가' }).click();
    await page.locator('[data-condition-index="0"] select').first().selectOption({ index: 1 });
    await page.locator('[data-condition-index="0"] input').fill('3');
    await page.locator('#addLineButton').click();
    await page.locator('.dialogue-entry').last().getByRole('textbox', { name: '대사' }).fill('충돌했어!');
    await page.locator('[data-rule-section="actions"]').getByRole('button', { name: '추가', exact: true }).click();
    await page.locator('#eventEditor .action-list input[type="checkbox"]').last().check();
    await page.locator('[data-rule-section="actions"]').getByRole('button', { name: '추가', exact: true }).click();
    const artAction = page.locator('[data-action-index="1"]');
    await artAction.locator('select').first().selectOption('illustration');
    await page.locator('[data-action-index="1"] select').nth(1)
      .selectOption(stage.assets.find(asset => asset.name === 'test-map.png').id);
    await page.locator('#previewCue').selectOption('event');
    await page.locator('#testEventButton').click();
    assert.match(await page.locator('#eventTestResult').textContent(), /조건 불충족/);
    assert.equal(await page.locator('#previewLine').textContent(), '대사 없음');
    await page.locator('[data-condition-index="0"] input').fill('2');
    await page.locator('[data-rule-section="actions"]').getByRole('button', { name: '추가', exact: true }).click();
    await page.locator('[data-action-index="2"] select').first().selectOption('add-variable');
    await page.locator('[data-action-index="2"] select').nth(1).selectOption({ index: 1 });
    await page.locator('[data-action-index="2"] input[type="number"]').fill('4');
    await page.locator('#testEventButton').click();
    assert.match(await page.locator('#eventTestResult').textContent(), /발동/);
    assert.match(await page.locator('#eventTestResult').textContent(), /2 → 6/);
    assert.match(await page.locator('#previewLine').textContent(), /충돌했어!/);
    await page.locator('#boardStatus').evaluate(element => { element.textContent = ''; });
    await page.locator('#storySaveButton').click();
    await page.locator('#boardStatus').getByText('저장됨').waitFor();
    await waitForStage(saved => saved.events?.[0]?.actions?.[0]?.dialogueIds?.length === 1);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#eventList') && document.querySelector('#stageTitle').value !== '');
    stage = await readStage();
    assert.equal(stage.variables[0].name, '경고 수치');
    assert.equal(stage.variables[0].initial, 2);
    assert.equal(stage.events[0].trigger.objectId, stage.objects[0].id);
    assert.equal(stage.events[0].once, true);
    assert.equal(stage.events[0].conditions[0].value, 2);
    assert.deepEqual(stage.events[0].actions[0].dialogueIds, [stage.dialogue.at(-1).id]);
    assert.equal(stage.events[0].actions[1].assetId, stage.assets.find(asset => asset.name === 'test-map.png').id);
    assert.equal(stage.events[0].actions[2].amount, 4);
    assert.deepEqual(stage.objects[0].runtime, { pulsePower: 3, pulseEnabled: true, pulseStyle: 'hard' });
    await page.locator('#storyTab').click();
    await page.locator('#eventList .event-item').first().waitFor();
    await page.locator('#eventList .event-item').first().click();
    await page.locator('#eventEditor').getByRole('button', { name: '개체 편집으로 이동' }).click();
    assert.equal(await page.locator('#objectId').textContent(), stage.objects[0].id);
    await page.locator('#objectEventsButton').click();
    assert.match(await page.locator('#eventList .selected').textContent(), /충돌 연출/);
    await page.locator('#eventEditor').getByRole('button', { name: '개체 편집으로 이동' }).click();
    assert.equal(await page.locator('#objectId').textContent(), stage.objects[0].id);
    await page.locator('#assetCategory').selectOption('all');
    await page.locator('#assetList .asset-button').filter({ hasText: '더미 스톤' }).click();
    point = await boardPoint(590, 310);
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.locator('[data-runtime-key="pulseRadius"]').inputValue(), '118');
    await page.locator('[data-runtime-key="pulseRadius"]').fill('140');
    await page.locator('[data-runtime-key="pulseRadius"]').press('Tab');
    await page.locator('#assetList .asset-button').filter({ hasText: '더미 트리거' }).click();
    point = await boardPoint(710, 310);
    await page.mouse.click(point.x, point.y);
    await page.locator('[data-runtime-key="frictionMultiplier"]').fill('0.6');
    await page.locator('[data-runtime-key="frictionMultiplier"]').press('Tab');
    await page.locator('[data-runtime-key="revealFog"]').check();
    await page.locator('[data-runtime-key="dialogueWhen"]').selectOption('resting');
    await page.locator('#saveButton').click();
    stage = await waitForStage(saved => saved.objects.some(object => object.assetId === 'builtin:dummy-trigger' && object.runtime?.dialogueWhen === 'resting'));
    assert.equal(stage.objects.find(object => object.assetId === 'builtin:dummy-stone').runtime.pulseRadius, 140);
    assert.equal(stage.objects.find(object => object.assetId === 'builtin:dummy-trigger').runtime.frictionMultiplier, 0.6);
    assert.equal(stage.objects.find(object => object.assetId === 'builtin:dummy-trigger').runtime.revealFog, true);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportButton').click();
    const download = await downloadPromise;
    const exported = JSON.parse(readFileSync(await download.path(), 'utf8'));
    assert.equal(exported.events[0].name, '충돌 연출');
    assert.deepEqual(exported.explorationMarks, { iconSet: 'wayfinder', bonus: [
      { type: 'hand-card', cardId: 'reposition' }, { type: 'trigger-count', count: 2 }
    ] });
    assert.equal(exported.objects.find(object => object.assetId === 'builtin:dummy-stone').runtime.pulseRadius, 140);
    await page.locator('#stageFileInput').setInputFiles({ name: 'marks-roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
    await page.locator('#boardStatus').getByText('스테이지 가져옴').waitFor();
    stage = await readStage();
    assert.deepEqual(stage.explorationMarks, exported.explorationMarks);
    assert.equal(await page.locator('#explorationIconSet').inputValue(), 'wayfinder');
    await page.locator('#markVariableEditorButton').click();
    await page.locator('#addVariableButton').click();
    await page.locator('#storyStageButton').click();
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-type').selectOption('variable');
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-description').fill('카드 사용 없이 클리어');
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-description').press('Tab');
    const variableId = (await readStage()).variables[0].id;
    await page.locator('.exploration-bonus-row').nth(1).locator('.exploration-bonus-variable').selectOption(variableId);
    await page.locator('#saveButton').click();
    stage = await waitForStage(saved => saved.explorationMarks.bonus[1]?.variableId === variableId);
    assert.deepEqual(stage.explorationMarks.bonus[1], {
      type: 'variable', description: '카드 사용 없이 클리어', variableId, operator: 'eq', value: 'true'
    });
    await page.locator('#storyTab').click();
    const firstDialogue = page.locator('.dialogue-entry').first();
    await firstDialogue.getByRole('textbox', { name: '대사' }).fill('첫 줄\n둘째 줄');
    await firstDialogue.getByLabel('글꼴').selectOption('serif');
    await firstDialogue.getByLabel('글자 크기').fill('22');
    await firstDialogue.getByLabel('글자 크기').press('Tab');
    await firstDialogue.getByLabel('등장 효과').selectOption('typewriter');
    await firstDialogue.getByLabel('타자 속도 (글자/초)').fill('90');
    await firstDialogue.getByLabel('타자 속도 (글자/초)').press('Tab');
    await firstDialogue.getByRole('textbox', { name: '연출 메모' }).fill('둘째 줄 앞에서 잠깐 멈춘다');
    await firstDialogue.getByRole('button', { name: '이 대사 미리보기' }).click();
    assert.equal(await page.locator('#dialoguePreviewOverlay').isVisible(), true);
    await page.waitForFunction(() => document.querySelector('#dialoguePreviewText').textContent === '첫 줄\n둘째 줄');
    assert.equal(await page.locator('#dialoguePreviewText').evaluate(element => getComputedStyle(element).fontSize), '22px');
    assert.match(await page.locator('#dialoguePreviewText').evaluate(element => getComputedStyle(element).fontFamily), /Georgia/);
    await page.locator('#dialoguePreviewInput').fill('첫 줄\n둘째 줄\n셋째 줄');
    await page.locator('#dialoguePreviewFontSize').fill('24');
    await page.locator('#dialoguePreviewFontSize').press('Tab');
    await page.locator('#dialoguePreviewReveal').selectOption('instant');
    assert.equal(await page.locator('#dialoguePreviewText').textContent(), '첫 줄\n둘째 줄\n셋째 줄');
    assert.equal(await page.locator('#dialoguePreviewText').evaluate(element => getComputedStyle(element).fontSize), '24px');
    await page.locator('#dialoguePreviewClose').click();
    assert.equal(await firstDialogue.getByRole('textbox', { name: '대사' }).inputValue(), '첫 줄\n둘째 줄\n셋째 줄');
    await page.locator('#storySaveButton').click();
    stage = await waitForStage(saved => saved.dialogue[0]?.presentation?.fontSize === 24);
    assert.equal(stage.dialogue[0].text, '첫 줄\n둘째 줄\n셋째 줄');
    assert.equal(stage.dialogue[0].presentation.reveal, 'instant');
    assert.equal(stage.dialogue[0].presentation.direction, '둘째 줄 앞에서 잠깐 멈춘다');
    assert.deepEqual(errors, []);
    console.log('Adventure editor loadout, asset, transform, group, event, and mechanic browser flows passed.');
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exited = once(server, 'exit'); server.kill(); await exited;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
