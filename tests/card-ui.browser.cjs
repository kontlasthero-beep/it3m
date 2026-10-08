// Run with PLAYWRIGHT_MODULE pointing to Playwright if it is not installed locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

(async () => {
  const port = 4189;
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port) }, windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Server exited: ${code}`)));
      server.stdout.once('data', resolve);
    });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    let page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
      .replace(/\}\)\(\);\s*<\/script>/, 'window.testGame = code => eval(code); })(); </script>');
    await page.route(`http://127.0.0.1:${port}/`, route => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.renderEnabled = true;
      window.requestAnimationFrame = callback => raf(time => { if (window.renderEnabled) callback(time); });
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    const run = code => page.evaluate(code => window.testGame(code), code);
    await run('startTutorial()');
    assert.equal(await page.locator('#powerLaunchButton').isVisible(), true);
    const powerLaunch = path.join(os.tmpdir(), 'curling-power-launch.png');
    await page.screenshot({ path: powerLaunch });
    await page.locator('#powerLaunchButton').click();
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#powerTrack').isVisible(), true);
    const desktopMeterRect = await page.locator('#powerPanel').boundingBox();
    assert.ok(desktopMeterRect.y >= 0 && desktopMeterRect.y + desktopMeterRect.height <= 1000);
    const powerDesktop = path.join(os.tmpdir(), 'curling-power-desktop.png');
    await page.screenshot({ path: powerDesktop });
    await page.locator('#powerConfirmButton').click();
    assert.equal(await run('state.powerMeter.stage'), 'locked');
    await page.waitForTimeout(360);
    assert.equal(await page.locator('#powerControl').isVisible(), false);
    const lockedPower = path.join(os.tmpdir(), 'curling-power-locked.png');
    await page.screenshot({ path: lockedPower });
    const launchBoard = await page.locator('#game').boundingBox();
    const launchUnit = await run('({x:turns.currentUnit.x,y:turns.currentUnit.y})');
    const launchX = launchBoard.x + launchUnit.x * launchBoard.width / 1200;
    const launchY = launchBoard.y + launchUnit.y * launchBoard.height / 700;
    await page.mouse.move(launchX, launchY);
    await page.mouse.down();
    await page.mouse.move(launchX + 42 * launchBoard.width / 1200, launchY, { steps: 5 });
    await page.mouse.up();
    assert.equal(await run('turns.currentUnit.hasLaunched'), true);
    assert.equal(await run('state.powerMeter'), null);
    const hoverHand = async () => {
      await page.locator('#hand0 .ability-card').first().scrollIntoViewIfNeeded();
      const rect = await page.locator('#hand0 .ability-card').first().boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    };
    await run(`startTutorial(); loadTutorialLesson(tutorialLessons().findIndex(item=>item.id==='card-guard'));`);
    await hoverHand();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#cardInspector').isVisible(), true);
    assert.ok(await page.locator('#cardInspector .card-art').evaluate(image => image.complete && image.naturalWidth > 0));
    assert.match(await page.locator('#cardInspector .card-rules').innerText(), /위성/);
    const desktop = path.join(os.tmpdir(), 'curling-cards-desktop.png');
    await page.screenshot({ path: desktop });

    // Drag the expanded card, not the underlying compact element.
    const preview = await page.locator('#cardInspector').boundingBox();
    await page.mouse.move(preview.x + preview.width / 2, preview.y + 70);
    await page.mouse.down();
    assert.equal(await page.locator('.card-ghost.drag-card').isVisible(), true);
    assert.equal(await page.locator('.card-ghost .card-rules').isVisible(), false);
    assert.ok((await page.locator('.card-ghost').boundingBox()).width <= 112);
    const canvas = await page.locator('#gameCanvas').count() ? page.locator('#gameCanvas') : page.locator('canvas').first();
    const board = await canvas.boundingBox();
    const target = await run('({x:turns.currentUnit.x,y:turns.currentUnit.y})');
    await page.mouse.move(board.x + target.x * board.width / 1200, board.y + target.y * board.height / 710, { steps: 8 });
    assert.equal(await page.locator('.card-ghost.valid-target').count(), 1);
    await page.waitForTimeout(160);
    assert.ok((await page.locator('.card-ghost').boundingBox()).width <= 70);
    const validCard = path.join(os.tmpdir(), 'curling-card-valid.png');
    await page.screenshot({ path: validCard });
    await page.mouse.up();
    assert.equal(await run('state.hands[0].length'), 1);
    assert.equal(await run('Boolean(turns.currentUnit.ability.guard)'), true);

    await run(`loadTutorialLesson(tutorialLessons().findIndex(item=>item.id==='card-brick'));`);
    await hoverHand();
    const brickCard = await page.locator('#cardInspector').boundingBox();
    await page.mouse.move(brickCard.x + brickCard.width / 2, brickCard.y + 70);
    await page.mouse.down();
    await page.mouse.move(board.x + 420 * board.width / 1200, board.y + 355 * board.height / 700, { steps: 8 });
    assert.equal(await page.locator('.card-ghost').evaluate(element => getComputedStyle(element).visibility), 'hidden');
    const brickPreview = path.join(os.tmpdir(), 'curling-brick-preview.png');
    await page.screenshot({ path: brickPreview });
    await page.mouse.move(board.x + 1010 * board.width / 1200, board.y + 355 * board.height / 700, { steps: 8 });
    assert.equal(await page.locator('.card-ghost').evaluate(element => getComputedStyle(element).visibility), 'visible');
    await page.mouse.up();

    await run(`loadTutorialLesson(tutorialLessons().findIndex(item=>item.id==='walls')); setSpeedLevel(0); applyUnitEffectStack(turns.currentUnit,'guard');
      window.renderEnabled=false; window.snapshotsSent=0;
      onlineSession={started:true,role:'host',playerIndex:0,roundIndex:0,wins:[0,0],totalScores:[0,0],roundResults:[],maps:['moving-walls']};
      sendOnlineRealtimeMessage=()=>{window.snapshotsSent++;return true;};`);
    const before = await run('state.mapTime');
    await page.waitForTimeout(1200);
    assert.ok(await run('state.mapTime') > before + .9);
    assert.ok(await run('turns.currentUnit.ability.guardAngle') > 1);
    assert.ok(await page.evaluate(() => window.snapshotsSent) > 15);

    await run(`onlineSession=null; window.renderEnabled=true; requestAnimationFrame(gameLoop);
      loadTutorialLesson(tutorialLessons().findIndex(item=>item.id==='turn')); state.turnDeadline=Date.now()+9950;`);
    await page.waitForTimeout(60);
    assert.equal(await page.locator('#turnTimer').getAttribute('data-seconds'), '10');
    const timerRect = await page.locator('#turnTimer').boundingBox();
    assert.ok(timerRect.y < (await canvas.boundingBox()).y);
    await run(`learningUI.tutorialSettingsOverlay.hidden=false; turns.currentUnit.status='sliding'; state.phase='sliding'; updateTurnTimer();`);
    const pausedSeconds = await page.locator('#turnTimer').innerText();
    await page.waitForTimeout(1100);
    assert.equal(await page.locator('#turnTimer').innerText(), pausedSeconds);
    await run(`learningUI.tutorialSettingsOverlay.hidden=true; turns.currentUnit.status='resting'; state.phase='turn-ready'; updateTurnTimer();`);
    await page.waitForTimeout(1100);
    assert.notEqual(await page.locator('#turnTimer').innerText(), pausedSeconds);
    await run('openCatalog()');
    assert.doesNotMatch(await page.locator('#catalogList').innerText(), /파워 미터의 최대 출력이 15%/);
    const relocationArt = page.locator('.catalog-card-art[data-card-id="reposition"]');
    await relocationArt.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => {
      const image = document.querySelector('.catalog-card-art[data-card-id="reposition"]');
      return image?.complete && image.naturalWidth > 0;
    });
    assert.ok(await relocationArt.evaluate(image => image.complete && image.naturalWidth > 0));
    assert.equal(await relocationArt.evaluate(image => getComputedStyle(image).objectPosition), '50% 18%');
    assert.equal(await page.locator('.catalog-card-art').count(), 8);
    assert.ok(await page.locator('.catalog-card-art[data-card-id="bluffing"]').evaluate(image => image.complete && image.naturalWidth > 0));
    await page.locator('.catalog-card-art[data-card-id="bluffing"]').scrollIntoViewIfNeeded();
    const bluffingArt = path.join(os.tmpdir(), 'curling-bluffing-art.png');
    await page.screenshot({ path: bluffingArt });
    const catalog = path.join(os.tmpdir(), 'curling-card-catalog.png');
    await page.screenshot({ path: catalog });

    const mobileContext = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    page = await mobileContext.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route(`http://127.0.0.1:${port}/`, route => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.goto(`http://127.0.0.1:${port}/`);
    await run('startTutorial()');
    await page.locator('#powerLaunchButton').tap();
    await page.waitForTimeout(100);
    const meterRect = await page.locator('#powerPanel').boundingBox();
    const mobileBoard = await page.locator('#game').boundingBox();
    assert.ok(meterRect.x >= mobileBoard.x && meterRect.x + meterRect.width <= mobileBoard.x + mobileBoard.width);
    assert.ok(meterRect.y >= mobileBoard.y && meterRect.y + meterRect.height <= mobileBoard.y + mobileBoard.height);
    await page.waitForTimeout(500);
    const visibleMeter = await page.locator('#powerPanel').boundingBox();
    assert.ok(visibleMeter.y >= 0 && visibleMeter.y + visibleMeter.height <= 390);
    const powerMobile = path.join(os.tmpdir(), 'curling-power-mobile.png');
    await page.screenshot({ path: powerMobile });
    await page.locator('#powerConfirmButton').tap();
    assert.equal(await run('state.powerMeter.stage'), 'locked');
    await page.waitForTimeout(360);
    assert.equal(await page.locator('#powerControl').isVisible(), false);
    await run(`startTutorial(); loadTutorialLesson(tutorialLessons().findIndex(item=>item.id==='card-guard'));`);
    await page.locator('#hand0 .ability-card').first().tap();
    await page.waitForTimeout(200);
    const mobileRect = await page.locator('#cardInspector').boundingBox();
    assert.ok(mobileRect.x >= 0 && mobileRect.y >= 0 && mobileRect.x + mobileRect.width <= 844 && mobileRect.y + mobileRect.height <= 390);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const mobile = path.join(os.tmpdir(), 'curling-cards-mobile.png');
    await page.screenshot({ path: mobile });
    await run(`hideCardInspector(); state.deck=[{id:'guard',name:'방호벽'}]; drawCardForPlayer(0,()=>{state.phase='aiming';});`);
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#dealCard .card-art').evaluate(image => image.complete && image.naturalWidth > 0));
    const draw = path.join(os.tmpdir(), 'curling-card-draw.png');
    await page.screenshot({ path: draw });
    await page.waitForTimeout(1500);
    assert.equal(await page.locator('#dealOverlay').isVisible(), false);
    assert.equal(await run('state.hands[0].at(-1).id'), 'guard');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ desktop, mobile, draw, catalog, powerLaunch, powerDesktop, powerMobile, lockedPower, validCard, brickPreview, bluffingArt, result: 'All browser checks passed' }));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
