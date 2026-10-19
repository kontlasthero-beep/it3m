const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

(async () => {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), DATABASE_URL: '' }, windowsHide: true
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
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
      .replace(/\}\)\(\);\s*<\/script>/, 'window.testGame = code => eval(code); })(); </script>');
    await page.route(`http://127.0.0.1:${port}/`, route => route.fulfill({ body: html, contentType: 'text/html' }));
    const run = code => page.evaluate(code => window.testGame(code), code);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('#guestPlayButton').click();
    await page.locator('#confirmGuestButton').click();
    await page.locator('#tutorialDialogue').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#gameSettingsButton').isVisible(), false);
    await page.screenshot({ path: path.join(os.tmpdir(), 'second-chance-tutorial-intro.png') });
    for (let i = 0; i < 3; i++) await page.locator('#tutorialDialogueNext').click();
    await page.locator('#tutorialNicknameInput').fill('새 탐험가');
    await page.locator('#tutorialNicknameForm button').click();
    await page.locator('#gameSettingsButton').waitFor({ state: 'visible' });
    assert.match(await page.locator('#tutorialDialogueText').textContent(), /새 탐험가/);
    await page.locator('#gameSettingsButton').click();
    await page.locator('#tutorialSkipButton').click();
    assert.equal(await page.locator('#settingsAudioControls').isVisible(), false);
    await page.locator('#gameLeaveCancelButton').click();
    assert.equal(await page.locator('#gameSettingsOverlay').isVisible(), false);
    for (let i = 0; i < 4; i++) await page.locator('#tutorialDialogueNext').click();
    assert.equal(await page.locator('#tutorialNextButton').isDisabled(), true);
    assert.equal(await page.locator('.board-dock').isVisible(), false);
    assert.equal(await page.locator('.hands').isVisible(), false);
    assert.equal(await page.locator('#panel1').isVisible(), false);
    await page.screenshot({ path: path.join(os.tmpdir(), 'second-chance-tutorial-launch.png') });

    // Exercise the real physics, looking for a playable shot rather than forcing a result.
    const solutions = await run(`(() => {
      const found = [];
      for (const stage of [0,1,2,3]) {
        let solution = null;
        for (let percent=25;percent<=100;percent+=1) {
          loadTutorialLesson(stage,false);
          const unit=turns.currentUnit;
          if(stage===2) useCard(state.hands[0][0].instanceId,0,unit);
          else state.powerMeter={unitId:unit.id,stage:'locked',value:percent/100};
          state.aimPoint={x:unit.x+100,y:unit.y}; launchCurrentUnit();
          for(let step=0;step<2400&&!state.tutorial.outcomeResolved;step++) update(1/120,step*1000/120,false);
          if(state.tutorial.complete){solution=percent;break;}
          if(stage===2) break;
        }
        found.push({stage,solution});
      }
      return found;
    })()`);
    assert.ok(solutions.every(item => item.solution !== null), JSON.stringify(solutions));
    console.log('Playable tutorial shots:', solutions);
    await run('loadTutorialLesson(2,false)');
    assert.equal(await page.locator('#handPanel0').isVisible(), true);
    assert.equal(await page.locator('#handPanel1').isVisible(), false);
    assert.equal(await page.locator('#handPanel0 .game-deck-button').isVisible(), false);
    assert.equal(await page.locator('#handPanel0 .trigger-tool').isVisible(), false);
    assert.equal(await page.locator('#turnTimer').isVisible(), true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'second-chance-tutorial-cards.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await run('loadTutorialLesson(3)');
    assert.equal(await page.locator('#handPanel0 .trigger-tool').isVisible(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: path.join(os.tmpdir(), 'second-chance-tutorial-mobile.png') });
    await page.locator('#gameSettingsButton').click();
    await page.locator('#tutorialSkipButton').click();
    await page.locator('#gameLeaveConfirmButton').click();
    await page.locator('#tutorialRewardOverlay').waitFor({ state: 'visible' });
    assert.match(await page.locator('#tutorialRewardTitle').textContent(), /재배치/);
    await page.locator('#tutorialRewardNext').click();
    assert.match(await page.locator('#tutorialRewardTitle').textContent(), /모험/);
    await page.locator('#tutorialRewardNext').click();
    await page.locator('#homeScreen').waitFor({ state: 'visible' });
    assert.equal(await run('guestProfile.tutorialCompleted && guestProfile.adventureUnlocked'), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('#openAccountButton').click();
    await page.locator('#accountModeButton').click();
    await page.locator('#accountUsernameInput').fill('tutorial_tester');
    await page.locator('#accountPasswordInput').fill('tutorial-password-123');
    assert.equal(await page.locator('#accountNicknameField').isVisible(), false);
    await page.locator('#accountSubmitButton').click();
    await page.locator('#tutorialDialogue').waitFor({ state: 'visible' });
    for (let i = 0; i < 3; i++) await page.locator('#tutorialDialogueNext').click();
    await page.locator('#tutorialNicknameInput').fill('더글라스의 신입');
    await page.locator('#tutorialNicknameForm button').click();
    await page.locator('#gameSettingsButton').waitFor({ state: 'visible' });
    await page.route('**/api/profile/tutorial', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '저장 재시도 테스트' }) }), { times: 1 });
    await page.locator('#gameSettingsButton').click();
    await page.locator('#tutorialSkipButton').click();
    await page.locator('#gameLeaveConfirmButton').click();
    await page.waitForFunction(() => document.querySelector('#tutorialDialogue').dataset.lineId === 'save-error');
    assert.equal(await run('guestProfile.tutorialCompleted'), false);
    await page.locator('#tutorialDialogueNext').click();
    await page.locator('#tutorialRewardOverlay').waitFor({ state: 'visible' });
    await page.locator('#tutorialRewardNext').click();
    await page.locator('#tutorialRewardNext').click();
    await page.locator('#openAccountButton').click();
    await page.locator('#logoutButton').click();
    await page.locator('#accountUsernameInput').fill('tutorial_tester');
    await page.locator('#accountPasswordInput').fill('tutorial-password-123');
    await page.locator('#accountSubmitButton').click();
    await page.locator('#homeScreen').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#tutorialDialogue').isVisible(), false);
    assert.equal(await run('guestProfile.tutorialCompleted && guestProfile.adventureUnlocked'), true);
    assert.equal(await page.locator('#guestProfileName').textContent(), '더글라스의 신입');
    assert.deepEqual(errors, []);
    console.log('Tutorial browser flow passed. Screenshots:', os.tmpdir());
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exited = once(server, 'exit'); server.kill(); await exited;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
