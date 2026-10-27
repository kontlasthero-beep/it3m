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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8')
      .replace(/\}\)\(\);\s*<\/script>/, 'window.testGame = code => eval(code); })(); </script>');
    await page.route(`http://127.0.0.1:${port}/`, route => route.fulfill({ body: html, contentType: 'text/html' }));
    const run = code => page.evaluate(value => window.testGame(value), code);
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.locator('#guestPlayButton').click();
    await page.locator('#confirmGuestButton').click();
    await page.locator('#tutorialDialogue').waitFor({ state: 'visible' });
    await run('renderGuestProfile({ ...guestProfile, tutorialCompleted: true, adventureUnlocked: true }, false); returnToHome()');
    await page.locator('#homeScreen').waitFor({ state: 'visible' });
    await page.locator('#openPlayMenuButton').click();
    assert.equal(await page.locator('.start-menu-grid button').count(), 6);
    const ai = await page.locator('#openAiScreenButton').boundingBox();
    const adventure = await page.locator('#openAdventureScreenButton').boundingBox();
    assert.ok(Math.abs(ai.y - adventure.y) < 2);
    await page.locator('#openAdventureScreenButton').click();
    await page.locator('#adventureStageTitle').getByText('데이터 속으로').waitFor();
    await run('adventureStage.props.pop(); openAdventureScreen()');
    assert.equal(await run('adventureStage.props.length'), 28);
    await page.screenshot({ path: path.join(os.tmpdir(), 'second-chance-adventure-select.png') });
    await page.locator('#adventureNextButton').click();
    assert.equal(await page.locator('#adventurePlayButton').isDisabled(), true);
    assert.equal(await page.locator('#adventureStagePreview').getAttribute('class'), 'adventure-stage-preview locked');
    assert.equal(await page.locator('#adventureStageTitle').textContent(), '스테이지 02');
    await page.locator('#adventurePreviousButton').click();
    await page.locator('#adventurePlayButton').click();
    for (let index = 0; index < 3; index += 1) await page.locator('#adventureDialogueNext').click();
    assert.equal(await run('state.bricks.length'), 0);
    assert.equal(await run('state.adventure.props.length'), 28);
    assert.equal(await run('state.adventure.dummies.length'), 3);
    assert.equal(await run('state.adventure.fogVisible'), true);
    assert.deepEqual(await run('(() => { draw(); return Array.from(ctx.getImageData(100, 200, 1, 1).data); })()'), [6, 9, 12, 255]);
    assert.ok(Math.abs(await run('turns.currentUnit.radius') - 20.3) < 0.001);
    assert.deepEqual(await run('state.adventure.dummies.map(dummy => dummy.radius)'), [29, 29, 29]);
    assert.equal(await run("state.adventure.props.find(prop => prop.id === '3e69db8d-2761-41d7-92ff-85f9cd221240').flipX"), true);
    assert.equal(await run('state.triggers.length'), 2);
    assert.deepEqual(await run('state.triggers.map(trigger => trigger.radius)'), [39.64, 39.835]);
    assert.deepEqual(await run('state.hands[0].map(card => card.id)'), []);
    assert.deepEqual(await run('({x:turns.currentUnit.x,y:turns.currentUnit.y})'), { x: 1106, y: 494 });
    assert.equal(await page.locator('#endTurnButton').isVisible(), false);
    await page.locator('#adventureStageImage').evaluate(image => image.decode());
    await page.screenshot({ path: path.join(os.tmpdir(), 'second-chance-adventure-stage-01.png') });
    const pulse = await run(`(() => { const unit=turns.currentUnit, dummy=state.adventure.dummies[0];
      unit.x=dummy.x+dummy.radius+unit.radius-1;unit.y=dummy.y;unit.vx=-80;unit.vy=0;
      unit.status='sliding';resolveAdventureCollisions(1/120);
      return {recharge:dummy.recharge,velocity:unit.vx,effect:state.effects.at(-1)?.type,
        friction:unit.adventurePulseFrictionMultiplier,timer:unit.adventurePulseFrictionTimer}; })()`);
    assert.equal(pulse.recharge, 1.5);
    assert.ok(pulse.velocity > 300);
    assert.equal(pulse.effect, 'pulse');
    assert.equal(pulse.friction, .5);
    assert.equal(pulse.timer, .48);
    const glancing = await run(`(() => { const unit=turns.currentUnit, dummy=state.adventure.dummies[1];
      const distance=dummy.radius+unit.radius-1, nx=.2, ny=Math.sqrt(1-nx*nx);
      unit.x=dummy.x+distance*nx;unit.y=dummy.y+distance*ny;
      unit.vx=-600;unit.vy=0;unit.status='sliding';
      resolveAdventureCollisions(1/120);
      return {vx:unit.vx,vy:unit.vy,recharge:dummy.recharge}; })()`);
    assert.ok(glancing.vx < -300 && glancing.vy > 200);
    assert.ok(Math.hypot(glancing.vx, glancing.vy) > 500);
    assert.equal(glancing.recharge, 1.5);
    await run('startAdventureStage()');
    for (let index = 0; index < 3; index += 1) await page.locator('#adventureDialogueNext').click();
    const collected = await run(`(() => { const trigger=state.triggers[0], unit=turns.currentUnit;
      unit.status='sliding';unit.hasLaunched=true;unit.previousX=trigger.x;unit.previousY=trigger.y;
      unit.x=trigger.x;unit.y=trigger.y;collectItemTriggers();
      return { pending:state.adventure.pendingEvents.length,
        dialogueHidden:adventureUI.adventureDialogueOverlay.hidden,
        friction:unit.adventureFrictionTimer }; })()`);
    assert.equal(collected.pending, 1);
    assert.equal(collected.dialogueHidden, true);
    assert.equal(collected.friction, 1.5);
    assert.deepEqual(await run('state.hands[0].map(card => card.id)'), ['reposition']);
    assert.equal(await page.locator('#handPanel0').isVisible(), true);
    await run("(() => { const unit=turns.currentUnit;unit.status='resting';unit.x=650;unit.y=520;state.phase='turn-ready';evaluateAdventureOutcome(1/120); })()");
    assert.match(await page.locator('#adventureDialogueText').textContent(), /카드 칸/);
    await page.locator('#adventureDialogueNext').click();
    await run(`(() => { const trigger=state.triggers[0], unit=turns.currentUnit;
      unit.status='sliding';unit.previousX=trigger.x;unit.previousY=trigger.y;
      unit.x=trigger.x;unit.y=trigger.y;collectItemTriggers(); })()`);
    assert.equal(await run('state.adventure.fogVisible'), false);
    await run("(() => { const unit=turns.currentUnit;unit.status='resting';unit.x=650;unit.y=520;state.phase='turn-ready';evaluateAdventureOutcome(1/120); })()");
    assert.equal(await run('state.adventure.fogVisible'), false);
    assert.notDeepEqual(await run('(() => { draw(); return Array.from(ctx.getImageData(100, 200, 1, 1).data); })()'), [6, 9, 12, 255]);
    await page.locator('#adventureDialogueNext').click();
    await page.locator('#adventureDialogueNext').click();
    await run(`(() => { const unit=turns.currentUnit;unit.status='resting';unit.x=650;unit.y=520;
      state.phase='turn-ready';evaluateAdventureOutcome(4); })()`);
    assert.equal(await page.locator('#adventureOutcomeOverlay').isVisible(), false);
    assert.equal(await run('useCard(state.hands[0][0].instanceId, 0, turns.currentUnit)'), true);
    assert.equal(await run('state.phase'), 'reposition');
    await run('evaluateAdventureOutcome(4)');
    assert.equal(await page.locator('#adventureOutcomeOverlay').isVisible(), false);
    await run('startAdventureStage()');
    for (let index = 0; index < 3; index += 1) await page.locator('#adventureDialogueNext').click();
    await run(`(() => { const unit=turns.currentUnit;unit.hasLaunched=true;unit.status='resting';unit.x=650;
      unit.y=520;state.phase='turn-ready';evaluateAdventureOutcome(2.9); })()`);
    assert.equal(await page.locator('#adventureOutcomeOverlay').isVisible(), false);
    await run('evaluateAdventureOutcome(.2)');
    assert.equal(await page.locator('#adventureOutcomeTitle').textContent(), '다시 도전');
    await page.locator('#adventureRetryButton').click();
    for (let index = 0; index < 3; index += 1) await page.locator('#adventureDialogueNext').click();
    assert.deepEqual(await run('state.hands[0].map(card => card.id)'), []);
    await run(`(() => { const unit=turns.currentUnit;unit.hasLaunched=true;unit.status='resting';
      unit.x=state.adventure.stage.goal.x;unit.y=state.adventure.stage.goal.y;evaluateAdventureOutcome(1/120); })()`);
    assert.equal(await page.locator('#adventureOutcomeTitle').textContent(), '스테이지 클리어');
    assert.match(await page.locator('#adventureOutcomeText').textContent(), /어찌저찌 해냈군/);
    const chain = await run(`(() => {
      const originalFileSound=playFileSound, originalSound=playSound;
      let pulses=0;
      try {
        playFileSound=name=>{if(name==='pulseCast')pulses++};
        playSound=()=>{};
        startAdventureStage();
        adventureUI.adventureDialogueOverlay.hidden=true;
        state.triggers=[];
        state.adventure.fogVisible=false;
        const unit=turns.currentUnit, slope=.525, speed=1350, length=Math.hypot(1,slope);
        unit.x=610;unit.y=245;unit.previousX=610;unit.previousY=245;
        unit.launch(-speed/length,speed*slope/length);
        state.phase='sliding';
        for(let frame=0;frame<720&&!state.adventure.outcome;frame++) update(1/120,frame,false);
        return {pulses,outcome:state.adventure.outcome};
      } finally {playFileSound=originalFileSound;playSound=originalSound}
    })()`);
    assert.ok(chain.pulses >= 2);
    assert.equal(chain.outcome, 'success');
    await run('startAdventureStage()');
    for (let index = 0; index < 3; index += 1) await page.locator('#adventureDialogueNext').click();
    const event = await run(`(() => {
      const stage=state.adventure.stage, prop=stage.props[0];
      stage.events=[{id:'preview-event',name:'프리뷰',priority:1,once:true,enabled:true,
        trigger:{type:'object-collision',objectId:prop.id},conditions:[],actions:[
          {type:'hide-object',objectId:prop.id},
          {type:'illustration',assetId:stage.assets[0].id},
          {type:'dialogue',dialogueIds:[stage.dialogue[0].id]}
        ]}];
      emitAdventureEvent({type:'object-collision',objectId:prop.id});
      return {visible:state.adventure.eventState.visibleObjects.get(prop.id),
        queue:state.adventure.sceneQueue.length};
    })()`);
    assert.deepEqual(event, { visible: false, queue: 1 });
    assert.equal(await page.locator('#adventureIllustrationOverlay').isVisible(), true);
    await page.locator('#adventureIllustrationNext').click();
    assert.equal(await page.locator('#adventureDialogueOverlay').isVisible(), true);
    await page.locator('#adventureDialogueNext').click();
    assert.equal(await page.locator('#adventureDialogueOverlay').isVisible(), false);
    await run(`showAdventureDialogue([{id:'styled-line',speaker:'빅보이',text:'첫 줄\\n둘째 줄',
      presentation:{font:'serif',fontSize:22,reveal:'typewriter',speed:5}}])`);
    assert.equal(await page.locator('#adventureDialogueOverlay').isVisible(), true);
    assert.equal(await page.locator('#adventureDialogueText').evaluate(element => getComputedStyle(element).fontSize), '22px');
    await page.locator('#adventureDialogueNext').click();
    assert.equal(await page.locator('#adventureDialogueText').textContent(), '첫 줄\n둘째 줄');
    await page.locator('#adventureDialogueNext').click();
    assert.equal(await page.locator('#adventureDialogueOverlay').isVisible(), false);
    await run('startAdventureStage()');
    for (let index = 0; index < 3; index += 1) await page.locator('#adventureDialogueNext').click();
    const marks = await run(`(() => {
      const adventure=state.adventure, unit=turns.currentUnit;
      state.hands[0].push({ ...deckCard('reposition'), instanceId:'mark-test-card' });
      for (const trigger of adventure.stage.triggers) adventure.collectedTriggerIds.add(trigger.id);
      unit.hasLaunched=true; unit.status='resting'; unit.x=adventure.stage.goal.x; unit.y=adventure.stage.goal.y;
      evaluateAdventureOutcome(1/120);
      return adventure.markResult.count;
    })()`);
    assert.equal(marks, 3);
    assert.match(await page.locator('#adventureOutcomeMarks').textContent(), /완전 탐사 3\/3/);
    assert.equal(await page.locator('#adventureOutcomeMarks img').count(), 3);
    assert.match(await page.locator('#adventureOutcomeMarks img').first().getAttribute('src'), /exploration-mark-b-beacon\.png$/);
    await page.locator('#adventureSelectButton').click();
    assert.match(await page.locator('#adventureStageMarks').textContent(), /최고 탐사 표식 3\/3/);
    assert.equal(await page.locator('#adventureStageMarks img').count(), 3);
    assert.deepEqual(errors, []);
    console.log('Adventure browser flow passed. Screenshots:', os.tmpdir());
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      const exited = once(server, 'exit'); server.kill(); await exited;
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
