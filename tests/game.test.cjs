const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const aiPlanner = require('../ai-planner.js');

test('Second Chance branding is consistent between the game and web poster', () => {
  const gameHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const posterHtml = fs.readFileSync(path.join(__dirname, '../poster.html'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.webmanifest'), 'utf8'));

  assert.match(gameHtml, /<title>Second Chance<\/title>/);
  assert.match(gameHtml, /<h1>Second Chance<\/h1>/);
  assert.match(posterHtml, /<title>Second Chance \| 2041 기록<\/title>/);
  assert.match(posterHtml, /<h1><span>SECOND<\/span><span>CHANCE<\/span><\/h1>/);
  assert.equal(manifest.name, 'Second Chance');
  assert.equal(manifest.short_name, 'Second Chance');
});

function game() {
  const elements = new Map();
  const timeouts = [];
  let time = 1000;
  let wallOffset = 0;
  function element() {
    const attrs = {};
    return {
      style: { setProperty(name, value) { this[name] = value; } }, dataset: {}, hidden: false, value: '', checked: false, width: 1200, height: 710,
      classList: { add() {}, remove() {}, toggle() {} }, listeners: {}, children: [],
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(key, value) { attrs[key] = value; }, getAttribute(key) { return attrs[key]; },
      append(...items) { for (let item of items) { if (typeof item !== 'object') item = Object.assign(element(), { textContent: String(item) }); item.remove(); item.parentNode = this; this.children.push(item); } },
      replaceChildren(...items) { for (const item of this.children) item.parentNode = null; this.children = []; this.append(...items); },
      querySelector() { return element(); }, querySelectorAll() { return []; },
      getContext() { return new Proxy({}, { get: (target, key) => Reflect.has(target, key) ? target[key] : () => {} }); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 710 }; },
      focus() {}, remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; },
      cloneNode(deep) { const clone = element(); clone.dataset = {...this.dataset}; clone.className = this.className; if (deep) clone.append(...this.children.map(child => child.cloneNode(true))); return clone; },
      setPointerCapture() {}, contains(target) { return this === target || this.children.some(child => child.contains(target)); }
    };
  }
  const document = {
    body: element(), hidden: false,
    querySelector(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    getElementById(id) { return this.querySelector('#' + id); },
    querySelectorAll() { return []; }, createElement: element, addEventListener() {}
  };
  class Audio { play() { return Promise.resolve(); } pause() {} }
  const context = vm.createContext({
    document, window: { matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} },
    navigator: {}, location: { protocol: 'https:' }, Image: class {}, Audio,
    performance: { now: () => time }, Date: class extends Date { static now() { return Date.now() + wallOffset; } },
    console, assert, URL, WebSocket: { OPEN: 1 },
    requestAnimationFrame() {}, setTimeout(fn) { timeouts.push(fn); return timeouts.length; }, clearTimeout() {},
    setInterval() { return 1; }, clearInterval() {}, crypto: { randomUUID: () => 'test-id' }
  });
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../tutorial-story.js'), 'utf8'), context);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.run = code => eval(code); })();'), context);
  context.run(`globalThis.sounds = []; playSound = name => sounds.push(name); playFileSound = name => sounds.push(name);
    state.playerTutorialCompleted=[true,true];
    guestProfile={name:'테스터',level:1,tutorialCompleted:true};`);
  return { run: context.run, context, elements, tick: ms => { time += ms; }, wall: ms => { wallOffset += ms; },
    flush: () => timeouts.splice(0).forEach(fn => fn()) };
}

function onlinePair() {
  const host = game(), guest = game();
  host.run(`
    onlineSession = { started: true, role: 'host', playerIndex: 0, roundIndex: 0, wins: [0,0],
      totalScores: [0,0], roundResults: [], maps: ['moving-walls','classic','ice'], result: null };
    state.currentMap = MAPS[2]; turns.reset(1); turns.createCurrentUnit();
    state.phase = 'aiming'; applyUnitEffectStack(turns.currentUnit, 'guard'); startTurnTimer();
  `);
  guest.run(`onlineSession = {started: true, role: 'challenger', playerIndex: 1, roundIndex: 0, snapshotRevision: 0};`);
  function send(revision = 1) {
    const snapshot = host.run('JSON.stringify(createOnlineSnapshot())');
    guest.run(`handleOnlineRealtimeMessage(onlineSession, {type:'snapshot', revision:${revision}, snapshot:${snapshot}}, 'datachannel')`);
  }
  send();
  return {host, guest, send};
}

test('independent clock advances hidden-host physics and snapshots without animation frames', () => {
  const {host, guest} = onlinePair();
  host.run(`document.hidden = true; globalThis.sent = [];
    sendOnlineRealtimeMessage = (session, message) => { sent.push(message); return true; };
    advanceGameClock(performance.now());`);
  for (let i = 0; i < 40; i++) { host.tick(25); host.run('advanceGameClock(performance.now())'); }
  host.run(`assert.ok(state.mapTime > .98); assert.ok(turns.currentUnit.ability.guardAngle > 1.6);
    assert.ok(sent.length >= 19); assert.ok(sent.at(-1).snapshot.mapTime > .95);`);
  const snapshot = host.run('JSON.stringify(sent.at(-1).snapshot)');
  guest.run(`applyOnlineSnapshot(${snapshot}); updateOnlineInterpolation(performance.now()+100);
    assert.ok(state.mapTime > .95); assert.ok(turns.currentUnit.ability.guardAngle > 1.5);`);
});

test('clock accounts for delayed ticks and never counts an older animation timestamp twice', () => {
  const g = game();
  g.run(`state.currentMap=MAPS[2]; turns.reset(); turns.createCurrentUnit(); state.phase='aiming';
    advanceGameClock(1000); advanceGameClock(1500); advanceGameClock(1490); advanceGameClock(1500);
    assert.ok(Math.abs(state.mapTime-.5)<.01);`);
});

test('35 second turn timer is independent of game speed and echoes each final-ten count', () => {
  const g = game();
  g.run(`turns.reset(); turns.createCurrentUnit(); state.phase='aiming'; state.gameSpeed=.4;
    const before=Date.now(); startTurnTimer(); assert.ok(state.turnDeadline-before>=35000);
    assert.ok(state.turnDeadline-before<35050);
    for(let seconds=10;seconds>=1;seconds--) {
      state.turnDeadline=Date.now()+seconds*1000-20; updateTurnTimer();
      assert.equal(turnTimer.dataset.seconds,String(seconds).padStart(2,'0'));
      assert.equal(state.timerLastVisualSecond,seconds);
    }`);
});

test('stone motion freezes turn time and the countdown resumes at the saved value', () => {
  const g = game();
  g.run(`turns.reset(); turns.createCurrentUnit(); state.phase='aiming'; startTurnTimer();`);
  g.wall(4000);
  g.run(`updateTurnTimer(); globalThis.beforePause=turnTimeRemaining();
    turns.currentUnit.status='sliding'; state.phase='sliding'; updateTurnTimer();
    assert.equal(turnTimer.classList !== null,true); assert.ok(state.turnPausedAt != null);`);
  g.wall(12000);
  g.run(`updateTurnTimer(); assert.ok(Math.abs(turnTimeRemaining()-beforePause)<50);
    assert.equal(turnTimer.textContent,'31');
    turns.currentUnit.status='resting'; state.phase='turn-ready'; updateTurnTimer();
    assert.ok(Math.abs(turnTimeRemaining()-beforePause)<50); assert.equal(state.turnPausedAt,null);`);
  g.wall(3000);
  g.run(`updateTurnTimer(); assert.equal(turnTimer.textContent,'28');
    assert.ok(turnTimeRemaining() < beforePause-2900);`);
});

test('AI planning does not consume the human turn countdown', () => {
  const g = game();
  g.run(`state.aiMode=true; state.aiOwner=turns.playerIndex; state.turnDeadline=Date.now()+5000;
    assert.equal(isTurnTimerPaused(),true);
    state.aiOwner=1-turns.playerIndex; assert.equal(isTurnTimerPaused(),false);`);
});

test('guest timer stays frozen from host snapshots while a stone slides', () => {
  const {host, guest, send} = onlinePair();
  host.run(`turns.currentUnit.status='sliding'; state.phase='sliding'; updateTurnTimer();`);
  send(2);
  guest.run(`updateTurnTimer(); assert.equal(state.turnPausedByHost,true);
    globalThis.pausedValue=turnTimeRemaining();`);
  guest.wall(10000);
  guest.run(`updateTurnTimer(); assert.ok(Math.abs(turnTimeRemaining()-pausedValue)<50);`);
  host.run(`turns.currentUnit.status='resting'; state.phase='turn-ready'; updateTurnTimer();`);
  send(3);
  guest.run(`updateTurnTimer(); assert.equal(state.turnPausedByHost,false);
    assert.ok(Math.abs(turnTimeRemaining()-pausedValue)<100);`);
  guest.wall(2500);
  guest.run(`updateTurnTimer(); assert.ok(turnTimeRemaining()<pausedValue-2400);`);
});

test('bag stack thins after a draw and its card travels from the bag through center to hand', () => {
  const g = game();
  g.run(`
    const bag = document.createElement('button');
    bag.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 54 });
    gameDeckButtons.push(bag);
    state.decks[0] = Array.from({ length: 8 }, () => ({ id: 'pulse' }));
    updateGameDeckButtons();
    assert.equal(bag.children.length, 9);
    assert.equal(bag.dataset.remaining, '8');
    state.decks[0].pop();
    updateGameDeckButtons();
    assert.equal(bag.children.length, 8);
    assert.equal(bag.dataset.remaining, '7');
    cardDrawVisual = { owner: 0, startedAt: performance.now() };
    dealOverlay.hidden = false;
    updateCardDrawVisual(performance.now());
    assert.equal(dealCard.style.left, '125px');
    assert.equal(dealCard.style.top, '127px');
  `);
  g.tick(280);
  g.run(`updateCardDrawVisual(performance.now()); assert.equal(dealCard.style.left, '600px');`);
  g.tick(1270);
  g.run(`updateCardDrawVisual(performance.now()); assert.equal(dealCard.style.left, '42px');`);
});

test('online turn owner alone controls speed, including host validation', () => {
  const {host, guest, send} = onlinePair();
  host.run(`updateHud(); assert.equal(speedToggle.disabled,true);
    handleOnlineHostAction({playerIndex:1,action:{type:'speed',level:2}});
    assert.equal(state.speedLevel,2);`);
  send(2);
  guest.run(`onlineSession.pendingActions=new Map(); sendOnlineRealtimeMessage=()=>true;
    assert.equal(speedToggle.disabled,false); speedToggle.listeners.click();
    assert.equal(state.speedLevel,0);`);
  host.run(`turns.reset(0); state.units=[]; turns.createCurrentUnit(); state.phase='aiming'; updateHud();
    assert.equal(speedToggle.disabled,false);
    handleOnlineHostAction({playerIndex:1,action:{type:'speed',level:1}});
    assert.equal(state.speedLevel,2);`);
  send(3);
  guest.run(`assert.equal(speedToggle.disabled,true); const old=state.speedLevel;
    speedToggle.listeners.click(); assert.equal(state.speedLevel,old);`);
});

test('ice friction is 80 percent of classic and catalog uses the card illustration files', () => {
  const g = game();
  g.run(`assert.ok(Math.abs(MAPS[1].friction/MAPS[0].friction-.8)<1e-10);
    renderCatalog('cards');
    const cards=cardDefinitions();
    cards.forEach((card,index)=>{
      const image=learningUI.catalogList.children[index].children[0].children[0];
      assert.equal(image.src,CARD_PRESENTATION[card.id].art);
      assert.equal(image.dataset.cardId,card.id);
    });`);
});

test('map backgrounds show the full concept art while aligning the visible edge to the fall bounds', () => {
  const g = game();
  const config = JSON.parse(g.run(`JSON.stringify(MAP_BACKGROUND_CONFIG)`));
  for (const mapId of ['classic','ice','moving-walls']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', config[mapId].src)));
  }
  g.run(`state.currentMap=MAPS[0];
    mapBackgroundImages.classic={src:'classic.png',complete:true,naturalWidth:1642,naturalHeight:958};
    globalThis.backgroundDraws=[]; globalThis.fillRects=[]; globalThis.strokeRects=[];
    ctx.drawImage=(...args)=>backgroundDraws.push(args);
    ctx.fillRect=(...args)=>fillRects.push(args);
    ctx.strokeRect=(...args)=>strokeRects.push(args);
    drawTable();`);
  assert.equal(g.run('backgroundDraws.length'), 3);
  const slices = JSON.parse(g.run(`JSON.stringify(backgroundDraws.map(args=>args.slice(1)))`));
  const imageTop = 68 - .089 * (594 / .78);
  const imageHeight = 594 / .78;
  assert.deepEqual(slices.map(args=>args.slice(4)), [[0,imageTop,88,imageHeight],
    [88,imageTop,1024,imageHeight], [1112,imageTop,88,imageHeight]]);
  assert.ok(Math.abs(slices[1][0] - 1642*.042) < .001);
  assert.ok(Math.abs(slices[1][2] - 1642*.90) < .001);
  assert.ok(Math.abs(slices[1][1] - 0) < .001);
  assert.ok(Math.abs(slices[1][3] - 958) < .001);
  assert.equal(g.run('strokeRects.length'), 0);
  assert.ok(!JSON.parse(g.run('JSON.stringify(fillRects)')).some(([x,y,w,h]) => x === 66 && y === 36 && w === 1068 && h === 638));
});

test('a stone falls as soon as its center crosses the visible table edge', () => {
  const g = game();
  g.run(`turns.reset(0);
    const cap=new CurlingUnit({id:'edge',owner:0,turnNumber:1,x:TABLE.left,y:365});
    cap.status='sliding'; cap.vx=-100; state.units=[cap];
    cap.update(0); assert.equal(cap.status,'sliding');
    cap.update(.02); assert.equal(cap.status,'fallen');
    assert.ok(cap.x < TABLE.left && cap.x > TABLE.left-cap.radius);`);
});

test('background draw completes exactly once and resets cancel stale draw callbacks', () => {
  const g = game();
  g.run(`globalThis.completed=0; state.decks[0]=[{id:'guard',name:'방호벽'}];
    drawCardForPlayer(0,()=>{completed++;state.phase='aiming';});
    assert.equal(cardDrawVisual.card.id,'guard');`);
  g.tick(1600); g.run('advanceGameClock(performance.now())'); g.flush();
  g.run(`assert.equal(completed,1); assert.equal(state.hands[0].length,1);
    assert.equal(state.hands[0][0].id,'guard');
    state.decks[0]=[{id:'ammo',name:'총알 장전'}]; drawCardForPlayer(0,()=>completed++); clearPracticeBoard();`);
  g.tick(1600); g.run('advanceGameClock(performance.now())'); g.flush();
  g.run('assert.equal(completed,1); assert.equal(state.hands[0].length,0)');
});

test('draw snapshot shares both players cards without restarting its animation', () => {
  const {host, guest, send} = onlinePair();
  host.run(`state.decks[0]=[{id:'guard',name:'방호벽'}]; drawCardForPlayer(0,()=>{});
    assert.equal(createOnlineSnapshot().cardDraw.card.id,'guard');`);
  host.flush();
  host.run(`state.decks[1]=[{id:'hardening',name:'경질화'}]; drawCardForPlayer(1,()=>{});`);
  send(2);
  guest.run(`assert.equal(cardDrawVisual.card.id,'hardening'); globalThis.drawStarted=cardDrawVisual.startedAt;`);
  host.tick(50); guest.tick(50); send(3);
  guest.run('assert.equal(cardDrawVisual.startedAt,drawStarted)');
  host.flush(); send(4);
  guest.run(`assert.equal(state.hands[0][0].id,'guard'); assert.equal(state.hands[1][0].id,'hardening')`);
});

test('hand reconciliation preserves hovered cards and every card has an existing illustration', () => {
  const g = game();
  g.run(`state.hands[0]=[{id:'guard',name:'방호벽',instanceId:'one'}]; renderHands();
    globalThis.cardNode=handEls[0].children[0]; showCardInspector(cardNode); renderHands();
    assert.equal(handEls[0].children[0],cardNode); assert.equal(cardInspector.hidden,false);
    state.hands[0]=[]; renderHands(); assert.equal(handEls[0].children.length,0);
    assert.equal(cardInspector.hidden,true);`);
  for (const asset of g.run('Object.values(CARD_PRESENTATION).map(item=>item.art)')) {
    assert.ok(fs.existsSync(path.join(__dirname,'..',asset)), asset);
  }
});

test('a click without a deliberate card drag cannot consume a neighboring card', () => {
  const g = game();
  g.run(`turns.reset(0); const cap=turns.createCurrentUnit(); state.phase='aiming';
    state.hands[0]=[{id:'guard',name:'방호벽',instanceId:'g1'}]; renderHands();
    const element=handEls[0].children[0];
    const event={currentTarget:element,clientX:cap.x,clientY:cap.y,pointerId:1,pointerType:'mouse',preventDefault(){}};
    beginCardDrag(event); assert.ok(state.cardDrag);
    finishCardDrag(event); assert.equal(state.cardDrag,null);
    assert.equal(state.hands[0].length,1); assert.equal(cap.ability?.guard,undefined);`);
});

test('snapshots advance walls and guards throughout a local aim without replacing the pointer', () => {
  const {host, guest, send} = onlinePair();
  guest.run(`localAimPointerId = 7; state.aiming = true; state.aimPoint = {x:1120,y:355}; state.aimTension=.3;`);
  const wallBefore = guest.run('wallSegments()[0].x');
  for (let i = 2; i <= 42; i++) {
    host.run('update(.025, performance.now())'); guest.tick(50); send(i);
    guest.run('updateOnlineInterpolation(performance.now() + 50)');
  }
  guest.run(`assert.equal(localAimPointerId, 7); assert.equal(state.aimPoint.x,1120);
    assert.equal(state.aimTension,.3); assert.equal(onlineSession.snapshotRevision,42);
    assert.ok(turns.currentUnit.ability.guardAngle > 1); assert.ok(state.mapTime > 1);`);
  assert.notEqual(guest.run('wallSegments()[0].x'), wallBefore);
});

test('card drag and trigger picker do not block snapshots, and timeout cancels stale input', () => {
  const {host, guest, send} = onlinePair();
  guest.run(`state.cardDrag = {owner:1, ghost:{remove(){}}, point:{x:400,y:400}};`);
  host.run('update(.025, 1000)'); send(2);
  guest.run(`assert.ok(state.cardDrag); state.cardDrag=null; openTriggerTypeSelection({x:400,y:400},1);`);
  host.run('update(.025, 1000)'); send(3);
  guest.run(`assert.equal(state.phase,'trigger-select'); assert.equal(triggerSelectOverlay.hidden,false);
    assert.equal(onlineSession.snapshotRevision,3); closeTriggerTypeSelection(true);
    localAimPointerId=9; state.aiming=true; state.aimPoint={x:1120,y:355};`);
  host.run('expireCurrentTurn()'); send(4);
  guest.run(`assert.equal(localAimPointerId,null); assert.equal(state.aiming,false);
    assert.equal(state.pendingTriggerPlacement,null); assert.equal(turns.playerIndex,0);`);
});

test('opponent aiming remains display-only and cannot suppress incoming updates', () => {
  const {host, guest, send} = onlinePair();
  host.run(`turns.reset(0); state.units=[]; turns.createCurrentUnit(); state.phase='aiming';
    startPowerMeter(); lockPowerMeter(.5); state.aiming=true; state.aimPoint={x:1100,y:355};`);
  send(2);
  guest.run(`assert.equal(localAimPointerId,null); assert.equal(state.aiming,true);
    canvas.listeners.pointerup({pointerId:5,clientX:1100,clientY:355});`);
  host.run('launchCurrentUnit()'); send(3);
  guest.run(`assert.equal(state.aiming,false); assert.equal(state.phase,'sliding'); assert.equal(onlineSession.snapshotRevision,3);`);
});

test('ammo aims without shaking and always launches at 300 percent maximum speed', () => {
  const g = game();
  g.run(`turns.createCurrentUnit(); globalThis.cap=turns.currentUnit; cap.status='resting';
    globalThis.fireAtPull=(instanceId,ratio)=>{
      state.phase='turn-ready'; state.repositionMode=null; state.repositionUnit=null;
      state.hands[0]=[{id:'ammo',name:'Ammo',instanceId}];
      assert.equal(useCard(instanceId,0,cap),true); state.aiming=true;
      updateAimFromInput(cap,{x:cap.x+CONFIG.maxPullDistance*ratio,y:cap.y});
      const tension=state.aimTension; drawAim(); const path=aimPath.getAttribute('d'); drawAim();
      assert.equal(aimPath.getAttribute('d'),path);
      launchCurrentUnit();
      return {tension,speed:Math.hypot(state.bullets.at(-1).vx,state.bullets.at(-1).vy)};
    };
    globalThis.lowPullShot=fireAtPull('ammo1',.15);
    assert.ok(Math.abs(lowPullShot.tension-.15)<1e-10);
    assert.equal(lowPullShot.speed,CONFIG.maxLaunchSpeed*3);
    assert.equal(state.phase,'sliding');`);
  g.tick(50);
  g.run(`assert.ok(!sounds.includes('elasticStretch'));
    state.bullets=[]; cap.activeSpecial=null;
    globalThis.highPullShot=fireAtPull('ammo2',.95);
    assert.ok(Math.abs(highPullShot.tension-.95)<1e-10);
    assert.equal(highPullShot.speed,lowPullShot.speed);
    assert.equal(highPullShot.speed,CONFIG.maxLaunchSpeed*3);
    assert.equal(turns.currentUnit.vx,0); assert.ok(sounds.includes('ammoFire')); assert.ok(!sounds.includes('launch'));`);
});

test('a falling ammo source cancels the queued shot and restores turn controls', () => {
  const g = game();
  g.run(`turns.reset(0); const cap=turns.createCurrentUnit(); cap.status='sliding'; cap.hasLaunched=true;
    state.phase='sliding'; state.hands[0]=[{id:'ammo',name:'총알 장전',instanceId:'a1'}];
    assert.equal(useCard('a1',0,cap),true); assert.equal(state.phase,'reposition');
    state.aiming=true; state.aimPoint={x:400,y:355}; localAimPointerId=7;
    cap.status='fallen'; update(0,performance.now());
    assert.equal(state.phase,'turn-ready'); assert.equal(state.repositionUnit,null);
    assert.equal(state.repositionMode,null); assert.equal(state.aiming,false);
    assert.equal(localAimPointerId,null); assert.equal(cap.activeSpecial,null);
    assert.equal(endTurnButton.disabled,false);
    endTurn(); assert.equal(turns.globalTurn,1);`);
});

test('an older ammo source falling while other stones move resumes normal simulation', () => {
  const g = game();
  g.run(`turns.reset(0); const old=new CurlingUnit({id:'old',owner:0,turnNumber:1,x:420,y:355});
    old.status='sliding'; old.hasLaunched=true; state.units.push(old);
    const current=turns.createCurrentUnit(); current.status='resting'; current.hasLaunched=true;
    state.phase='sliding'; state.hands[0]=[{id:'ammo',name:'총알 장전',instanceId:'a2'}];
    assert.equal(useCard('a2',0,old),true);
    old.status='fallen'; update(0,performance.now());
    assert.equal(state.phase,'turn-ready'); assert.equal(endTurnButton.disabled,false);`);
});

test('normal launch requires a locked meter and short drag controls direction only', () => {
  const g = game();
  g.run(`turns.createCurrentUnit(); state.phase='aiming'; const cap=turns.currentUnit;
    state.aimPoint={x:cap.x-60,y:cap.y}; launchCurrentUnit();
    assert.equal(cap.status,'ready'); assert.equal(state.powerMeter,null);
    assert.equal(startPowerMeter(),true);
    updateAimFromInput(cap,{x:cap.x+300,y:cap.y});
    assert.ok(Math.abs(state.aimPoint.x-cap.x-CONFIG.directionPullDistance)<.001);
    assert.ok(!sounds.includes('elasticStretch'));
    launchCurrentUnit(); assert.equal(cap.status,'ready');
    lockPowerMeter(.5); state.aimPoint={x:cap.x+50,y:cap.y}; launchCurrentUnit();
    assert.equal(cap.status,'sliding'); assert.ok(cap.vx<0);
    assert.ok(Math.abs(Math.hypot(cap.vx,cap.vy)-Math.min(CONFIG.maxLaunchSpeed,CONFIG.maxPullDistance*.5*CONFIG.launchScale))<.001);
    assert.equal(state.powerMeter,null);`);
});

test('meter bounces, Big Boy gets 15 percent more power, and reposition uses the meter', () => {
  const g = game();
  g.run(`state.heroChoices[0]='big-boy'; turns.createCurrentUnit(); state.phase='aiming';
    startPowerMeter(); for(let t=0;t<400;t++) updatePowerMeter(1000+t*25);
    assert.ok(state.powerMeter.value>=0 && state.powerMeter.value<=1);
    assert.ok(state.powerMeter.direction===1 || state.powerMeter.direction===-1);
    lockPowerMeter(1); const cap=turns.currentUnit;
    state.aimPoint={x:cap.x+40,y:cap.y}; launchCurrentUnit();
    assert.ok(Math.abs(Math.hypot(cap.vx,cap.vy)-CONFIG.maxLaunchSpeed*1.15)<.001);
    cap.status='resting'; cap.vx=0; cap.vy=0; state.phase='turn-ready';
    state.hands[0]=[{id:'reposition',name:'재배치',instanceId:'r1'}];
    assert.equal(useCard('r1',0,cap),true); assert.equal(state.phase,'reposition');
    assert.equal(startPowerMeter(),true); lockPowerMeter(.3);
    state.aimPoint={x:cap.x+40,y:cap.y}; launchCurrentUnit();
    assert.equal(state.phase,'sliding'); assert.equal(cap.relaunchUsed,true);
    assert.ok(Math.abs(Math.hypot(cap.vx,cap.vy)-CONFIG.maxPullDistance*.3*CONFIG.launchScale*1.15)<.001);`);
});

test('challenger power selection survives snapshots and host validates its launch', () => {
  const {host,guest,send}=onlinePair();
  guest.run(`startPowerMeter(); lockPowerMeter(.7);`);
  host.run(`handleOnlineHostAction({playerIndex:1,action:{type:'power-start',unitId:turns.currentUnit.id}});
    handleOnlineHostAction({playerIndex:1,action:{type:'power-lock',unitId:turns.currentUnit.id,value:.7}});
    assert.equal(state.powerMeter.stage,'locked');
    handleOnlineHostAction({playerIndex:1,action:{type:'launch',aimPoint:{x:turns.currentUnit.x+200,y:turns.currentUnit.y}}});
    assert.equal(turns.currentUnit.status,'ready');`);
  send(2);
  guest.run(`assert.equal(state.powerMeter.stage,'locked'); assert.equal(state.powerMeter.value,.7);`);
  host.run(`handleOnlineHostAction({playerIndex:1,action:{type:'launch',aimPoint:{x:turns.currentUnit.x+50,y:turns.currentUnit.y}}});
    assert.equal(turns.currentUnit.status,'sliding');`);
  send(3);
  guest.run(`assert.equal(state.phase,'sliding'); assert.equal(state.powerMeter,null);`);
});

test('power choice is shown above the stone, meter dismisses, and lock sound scales with power', () => {
  const g = game();
  g.run(`turns.createCurrentUnit(); state.phase='aiming';
    globalThis.lockSounds=[]; audio.sfxVolume=100;
    playElevenLabsSound=(name,options)=>lockSounds.push({name,options});
    assert.equal(startPowerMeter(),true); assert.equal(lockPowerMeter(.2),true); const low=lockSounds.at(-1);
    state.powerMeter=null; assert.equal(startPowerMeter(),true); assert.equal(lockPowerMeter(.9),true); const high=lockSounds.at(-1);
    assert.equal(lockSounds.length,2);
    assert.equal(low.name,'powerLock'); assert.equal(high.name,'powerLock');
    assert.ok(high.options.playbackRate>low.options.playbackRate);
    assert.ok(high.options.volume>low.options.volume);
    globalThis.labels=[]; ctx.fillText=(...args)=>labels.push(args);
    drawLockedPower(); assert.equal(labels.at(-1)[0],'90%');
    renderPowerControl(); assert.equal(powerControl.hidden,false);`);
  g.tick(301);
  g.run(`renderPowerControl(); assert.equal(powerControl.hidden,true); assert.equal(state.powerMeter.stage,'locked');`);
});

test('power meter is faster and irregular while the scoreboard shows scores without distances', () => {
  const g = game();
  g.run(`turns.createCurrentUnit(); state.phase='aiming'; startPowerMeter();
    updatePowerMeter(1100); assert.ok(state.powerMeter.value>.27);
    const firstRate=(state.powerMeter.value-.12)/.1;
    updatePowerMeter(1200); const nextRate=(state.powerMeter.value-.12-firstRate*.1)/.1;
    assert.notEqual(firstRate,nextRate);
    const cap=turns.currentUnit; cap.status='resting'; cap.x=TABLE.goalX+(TABLE.right-TABLE.goalX)*.25;
    state.fallPoints[0]=25; updateHud(); assert.equal(scoreEls[0].textContent,'100점');
    assert.deepEqual(scoreEls[0].dataset.scoreDetail.split(String.fromCharCode(10)),['1번째 스톤 75점','낙사·처치 등 추가 점수 +25점','합계 100점']);
    updatePlayerNames();
    assert.equal(playerLabelEls[0].textContent,PLAYER[0].name);
    assert.equal(remainingEls[0].getAttribute('aria-label'),PLAYER[0].name+' 남은 스톤 4개');
    assert.doesNotMatch(scoreEls[0].textContent,/거리|낙사|탈출/);
    assert.doesNotMatch(HEROES.find(hero=>hero.id==='big-boy').description,/파워 미터/);`);
  assert.match(fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),/stone-blue\.png" alt="" aria-hidden="true" draggable="false"/);
});

test('hand labels show each player name and selected hero description; inactive hand is grayscale without fading', () => {
  const g = game();
  g.run(`PLAYER[0].name='레나'; PLAYER[1].name='클럽 AI';
    state.heroChoices=['hunter','joker']; updateHud();
    assert.equal(document.querySelector('#handOwner0').textContent,'레나');
    assert.equal(document.querySelector('#handHero0').textContent,'헌터');
    assert.equal(document.querySelector('#handHero0').getAttribute('data-description'),HEROES.find(hero=>hero.id==='hunter').description);
    assert.equal(document.querySelector('#handHero0').hidden,false);
    assert.equal(document.querySelector('#handOwner1').textContent,'클럽 AI');
    assert.equal(document.querySelector('#handHero1').textContent,'조커');`);
  const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.match(html,/\.hand-hero-name:hover::after, \.hand-hero-name:focus-visible::after/);
  assert.match(html,/\.hand-panel:not\(\.current\) \{ filter: grayscale\(\.82\); transform: scaleY\(\.96\); \}/);
});

test('bluffing ignores stones, bricks, bullets, guards and map walls until the opponent turn ends', () => {
  const g = game();
  g.run(`turns.reset(0); const cap=turns.createCurrentUnit(); cap.status='resting';
    state.phase='turn-ready'; state.hands[0]=[{id:'bluffing',name:'속임수',instanceId:'b1'}];
    assert.equal(useCard('b1',0,cap),true); assert.equal(isCollisionPhased(cap),true);
    globalThis.cap=cap; const enemy=new CurlingUnit({id:'enemy',owner:1,turnNumber:1,x:cap.x+20,y:cap.y});
    enemy.status='resting'; state.units.push(enemy); globalThis.enemy=enemy;
    const x=cap.x; resolveCollisions(); assert.equal(cap.x,x); assert.equal(enemy.x,x+20);
    state.units=[cap]; const brick=new BrickUnit({x:cap.x,y:cap.y,owner:1}); state.bricks.push(brick);
    resolveBrickCollisions(); assert.equal(cap.x,x); assert.equal(brick.x,x);
    assert.equal(cap.frictionAtPosition(),state.currentMap.friction);
    state.units=[cap]; state.bricks=[];
    state.bullets=[{id:'shot',sourceUnitId:'enemy',x:cap.x,y:cap.y,vx:0,vy:0,radius:5,mass:.12,outsideTime:0}];
    updateBullets(.01); assert.equal(state.bullets.length,1);
    state.bullets=[]; enemy.x=cap.x-54; enemy.y=cap.y; applyUnitEffectStack(enemy,'guard');
    const satellite=guardSatellites(enemy)[0]; cap.x=satellite.x; cap.y=satellite.y;
    state.units=[enemy,cap]; const before={x:cap.x,y:cap.y}; resolveGuardCollisions();
    assert.equal(cap.x,before.x); assert.equal(cap.y,before.y);
    state.units=[cap]; state.currentMap=MAPS.find(map=>map.walls);
    const wall=wallSegments()[0]; cap.x=wall.x+wall.width/2; cap.y=wall.y+wall.height/2;
    const wallX=cap.x, wallY=cap.y; updateWalls(0);
    assert.equal(cap.x,wallX); assert.equal(cap.y,wallY);
    turns.finishCurrentTurn(); assert.equal(isCollisionPhased(cap),true);
    turns.createCurrentUnit(); turns.finishCurrentTurn(); assert.equal(isCollisionPhased(cap),false);
    assert.equal(cap.ability.bluffingUntilTurn,undefined);`);
});

test('bluffing still takes pulse and black-hole force and crosses online snapshots', () => {
  const {host,guest,send}=onlinePair();
  host.run(`const cap=turns.currentUnit; cap.status='resting';
    state.hands[1]=[{id:'bluffing',name:'속임수',instanceId:'b1'}];
    assert.equal(useCard('b1',1,cap),true);
    const source=new CurlingUnit({id:'source',owner:0,turnNumber:1,x:cap.x-50,y:cap.y});
    source.status='resting'; state.units.push(source);
    triggerPulse(source,100,80); assert.ok(cap.vx>0);
    cap.vx=0; triggerBlackHole(source,100); assert.ok(cap.vx<0);`);
  send(2);
  guest.run(`assert.equal(isCollisionPhased(turns.currentUnit),true);
    assert.ok(turns.currentUnit.vx<0);`);
});

test('opening cap gets a one-time 25 percent friction multiplier after turn end, stacking with hardening', () => {
  const g=game();
  g.run(`turns.reset(1); const first=turns.createCurrentUnit();
    assert.equal(first.frictionAtPosition(),state.currentMap.friction);
    applyUnitEffectStack(first,'hardening'); turns.finishCurrentTurn();
    assert.equal(first.frictionAtPosition(),state.currentMap.friction*3*1.25);
    const second=turns.createCurrentUnit(); turns.finishCurrentTurn();
    assert.equal(second.openingFrictionMultiplier,undefined);
    assert.equal(first.openingFrictionMultiplier,1.25);`);
});

test('round starters and extra initial card follow host, challenger, previous loser', () => {
  const g=game();
  g.run(`onlineSession={started:true,role:'host',playerIndex:0,roundIndex:0,wins:[0,0],maps:['classic','ice','items'],roundResults:[]};
    assert.equal(roundStartingPlayer(),0); onlineSession.roundIndex=1;
    assert.equal(roundStartingPlayer(),1); dealCards();`);
  g.flush(); g.flush();
  g.run(`assert.equal(turns.currentUnit.owner,1); assert.equal(state.hands[1].length,2); assert.equal(state.hands[0].length,0);
    const schedule=[]; while(!turns.isComplete) {schedule.push(turns.playerIndex); turns.finishCurrentTurn();}
    assert.deepEqual(schedule,[1,0,1,0,1,0,1,0,1,0]); onlineSession.roundIndex=2;
    onlineSession.roundResults=[{winner:0},{winner:1}]; assert.equal(roundStartingPlayer(),0);
    onlineSession.roundResults[1].winner=0; assert.equal(roundStartingPlayer(),1);
    onlineSession.roundResults[1].winner=null; assert.equal(roundStartingPlayer(),0);`);
});

test('card feedback reaches the guest once, while rejected cards do not emit effects', () => {
  const {host,guest,send}=onlinePair();
  host.run(`state.hands[1]=[{id:'hardening',name:'Hardening',instanceId:'h1'}];
    assert.equal(useCard('h1',1,turns.currentUnit),true);
    assert.equal(useCard('h1',1,turns.currentUnit),false);
    assert.equal(state.effects.filter(e=>e.type==='feedback').length,1);`);
  send(2); send(3);
  guest.run(`assert.equal(sounds.filter(s=>s==='hardening').length,1); drawEffects();`);
});

test('trigger confirmation emits feedback without throwing and resumes the turn', () => {
  const g=game();
  g.run(`turns.createCurrentUnit(); state.phase='aiming'; openTriggerTypeSelection({x:400,y:400},0);
    state.selectedTriggerType='guard'; confirmItemTriggerPlacement();
    assert.equal(state.triggers.length,1); assert.equal(state.phase,'aiming'); assert.equal(state.triggerPlacementUsed[0],true);`);
});

test('service worker bypasses even a preexisting cached room list', async () => {
  let listener, result, fetched=0, cached=0;
  const context=vm.createContext({ URL, self:{location:{origin:'https://test.example'},addEventListener(type,fn){if(type==='fetch') listener=fn;}},
    caches:{match(){cached++;return Promise.resolve({stale:true});}},
    fetch:async (_request,options)=>{fetched++;assert.equal(options.cache,'no-store');return {fresh:true};} });
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),context);
  listener({request:{method:'GET',url:'https://test.example/api/rooms'},respondWith(value){result=value;}});
  assert.deepEqual(await result,{fresh:true}); assert.equal(fetched,1); assert.equal(cached,0);
});

test('first entry opens Big Boy dialogue, collects a nickname, then reveals settings and launch practice', async () => {
  const g = game();
  g.run(`guestProfile={name:'신입',level:1,tutorialCompleted:false}; enterProfileLobby();
    assert.equal(state.tutorial.index,0); assert.equal(tutorialLessons().length,4);
    assert.equal(document.body.dataset.tutorialSettings,'false');
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'welcome');
    assert.equal(canControlPlayer(0),false);
    advanceTutorialDialogue(); advanceTutorialDialogue(); advanceTutorialDialogue();
    assert.equal(tutorialUI.tutorialNicknameForm.hidden,false);`);
  await g.run("saveTutorialNickname('탐험가')");
  g.run(`assert.equal(PLAYER[0].name,'탐험가'); assert.equal(guestProfile.name,'탐험가');
    assert.equal(state.tutorial.settingsReady,true); assert.equal(document.body.dataset.tutorialSettings,'true');
    assert.match(tutorialUI.tutorialDialogueText.textContent,/탐험가/);
    while(state.tutorial.dialogue) advanceTutorialDialogue();
    assert.equal(state.turnDeadline,null); assert.equal(canControlPlayer(0),true);
    assert.equal(learningUI.tutorialNextButton.disabled,true);
    assert.equal(state.hands[0].length,0); assert.equal(state.units.length,1);`);
});

test('tutorial dialogue and settings pause practice and returning resumes the same board', () => {
  const g=game();
  g.run(`startTutorial(); closeTutorialDialogue(); state.tutorial.settingsReady=true;
    loadTutorialLesson(2,false); globalThis.remaining=turnTimeRemaining();
    document.querySelector('#gameSettingsButton').listeners.click();
    assert.equal(gameSettingsOverlay.hidden,false); assert.equal(isTurnTimerPaused(),true);
    turns.currentUnit.vx=-200; turns.currentUnit.status='sliding'; state.phase='sliding';
    globalThis.oldX=turns.currentUnit.x; advanceGameClock(1000); advanceGameClock(1500);
    assert.equal(turns.currentUnit.x,oldX);
    closeSettingsToGame(); advanceGameClock(1800);
    assert.ok(turns.currentUnit.x<oldX);
    returnToHome(); assert.equal(state.tutorial,null); assert.equal(tutorialUI.tutorialDialogue.hidden,true);
    assert.equal(state.units.length,0); assert.equal(document.body.dataset.tutorial,'false');
    assert.equal(document.body.dataset.tutorialStage,undefined);
    beginRound(); assert.equal(state.tutorial,null);`);
});

test('first match after tutorial restores card panels instead of keeping tutorial-only hiding', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /body\[data-tutorial="true"\]\[data-tutorial-stage="launch"\] \.hands/);
  assert.doesNotMatch(html, /body\[data-tutorial-stage="launch"\] \.hands/);
  const g = game();
  g.run(`startTutorial(); closeTutorialDialogue();
    assert.equal(document.body.dataset.tutorialStage,'launch');
    returnToHome(); assert.equal(document.body.dataset.tutorialStage,undefined);
    document.body.dataset.tutorialStage='collision'; beginRound();
    assert.equal(document.body.dataset.tutorialStage,undefined);`);
});

test('new effect routes cover impact, placement, cards, and both speed directions', () => {
  const g = game();
  g.run(`globalThis.generated=[];
    playElevenLabsSound=(name,options)=>generated.push({name,options});
    assert.equal(CARD_PRESENTATION.pulse.sound,'pulseCharge');
    assert.equal(CARD_PRESENTATION['data-barrier'].sound,'dataBarrier');
    for (const name of ['strongHit','powerLock','hardening','guard','escape','reposition',
      'drop','bluffing','triggerPlace','pulseCharge','dataBarrier','speedChange','speedRestore']) {
      assert.ok(ELEVENLABS_SFX[name],name);
    }
    playUnitImpactSound(STRONG_HIT_THRESHOLD);
    assert.equal(generated.at(-1).name,'strongHit');
    state.speedLevel=0; setSpeedLevel(1,true);
    assert.equal(sounds.at(-1),'speedChange');
    setSpeedLevel(0,true); assert.equal(sounds.at(-1),'speedRestore');`);
  const sources = g.run('Object.values(ELEVENLABS_SFX)');
  for (const source of sources) assert.ok(fs.existsSync(path.join(__dirname, '..', source)), source);
});

test('AI mode chooses a hero, owns only player two, and completes a launch without pointer input', () => {
  const g = game();
  g.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='hard'; state.aiStyle='defender'; PLAYER[1].name='클럽 AI';
    startHeroSelection('ai'); const offered=state.heroOffers[0][0]; chooseHero(0,offered);
    assert.ok(state.heroChoices[1]); finishHeroSelection();
    clearTimeout(state.cardDrawTimer); pendingCardDraw=null; dealOverlay.hidden=true;
    state.phase='aiming'; state.units=[]; turns.reset(1); turns.createCurrentUnit();
    state.hands[1]=[]; assert.equal(canControlPlayer(1),false); assert.equal(canControlPlayer(0),true);
    updateAiPlayer(1000); updateAiPlayer(1600); assert.equal(state.powerMeter.stage,'spinning');
    state.powerMeter.value=state.aiAction.plan.power>.5?0:1;
    updateAiPlayer(1900); assert.equal(state.powerMeter.stage,'spinning');
    state.powerMeter.value=state.aiAction.plan.power;
    updateAiPlayer(2200); assert.equal(state.powerMeter.stage,'locked');
    updateAiPlayer(2800); assert.equal(turns.currentUnit.status,'sliding'); assert.ok(turns.currentUnit.vx<0);`);
});

test('AI applies a planned defense to an earlier stone and schedules its flight card', () => {
  const g = game();
  g.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='hard'; state.currentMap=MAPS[0];
    turns.reset(1); state.phase='aiming';
    const old=new CurlingUnit({id:'old-ai',owner:1,turnNumber:1,x:160,y:355});
    old.status='resting'; state.units=[old]; turns.createCurrentUnit();
    state.hands[1]=[{id:'guard',name:'방호벽',instanceId:'g1'},
      {id:'blackhole',name:'블랙홀 방출',instanceId:'b1'}];
    state.hands[0]=[{id:'ammo',name:'총알 장전',instanceId:'a1'}];
    const snapshot=aiPlannerSnapshot(turns.currentUnit);
    assert.ok(snapshot.hand.includes('guard'));
    assert.deepEqual(snapshot.enemyHand,['ammo']);
    assert.equal(snapshot.replyKoPoints,25);
    const action={plan:{tactics:[{card:'guard',at:0,targetId:'old-ai'},
      {card:'blackhole',at:1}],trigger:null}};
    aiApplyPlannedSetup(action,turns.currentUnit);
    assert.equal(old.ability.stacks.guard,1);
    assert.equal(action.scheduledTactics.length,1);
    assert.deepEqual(state.hands[1].map(card=>card.id),['blackhole']);
    state.aiAction={turn:turns.globalTurn,deadline:0,planSource:'simulation',
      scheduledTactics:action.scheduledTactics,launchedAt:1000,inFlightCardAt:0};
    turns.currentUnit.status='sliding'; state.phase='sliding';
    updateAiPlayer(2100);
    assert.equal(state.hands[1].length,0);
    assert.ok(turns.currentUnit.fluidTimer>0);`);
});

test('AI places a model-selected data barrier and explains the lane denial', () => {
  const g = game();
  g.context.UCCAiPlanner = aiPlanner;
  const result = g.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='normal';
    state.playerLevels=[1,2]; state.currentMap=MAPS[0]; turns.reset(1); state.phase='aiming';
    const enemy=new CurlingUnit({id:'enemy',owner:0,turnNumber:1,x:360,y:355}); enemy.status='resting';
    state.units=[enemy]; turns.createCurrentUnit();
    state.hands[1]=[{...deckCard('data-barrier'),instanceId:'planned-barrier'}];
    const snapshot=aiPlannerSnapshot(turns.currentUnit); const result=UCCAiPlanner.plan(snapshot,'normal');
    const action={plan:aiPlanToAim(turns.currentUnit,result)};
    aiApplyPlannedSetup(action,turns.currentUnit);
    ({type:state.bricks[0]?.barrier,intent:action.intent,remaining:state.hands[1].length,
      planned:result.structure,candidates:snapshot.structureCandidates});`);
  assert.equal(result.type, true);
  assert.match(result.intent, /진입로/);
  assert.equal(result.remaining, 0);
});

test('follow-up cards are selected by strategic utility rather than random chance', () => {
  const escapeGame = game();
  const escape = escapeGame.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='hard';
    state.aiAction={}; state.playerLevels=[1,2]; turns.reset(1); state.phase='turn-ready'; turns.createCurrentUnit();
    turns.currentUnit.status='resting';
    const poor=new CurlingUnit({id:'poor',owner:1,turnNumber:1,x:1050,y:355}); poor.status='resting';
    state.units.push(poor); state.hands[1]=[{...deckCard('escape'),instanceId:'escape'}];
    const used=aiUseFollowUpCard(turns.currentUnit);
    ({used,removed:poor.removedByEscape,points:state.escapePoints[1],intent:state.aiAction?.intent});`);
  assert.equal(escape.used, true);
  assert.ok(escape.removed || escapeGame.run("state.units.some(item=>item.owner===1 && item.removedByEscape)"));
  assert.equal(escape.points, 10);
  assert.match(escape.intent, /확정 점수/);

  const ammoGame = game();
  const ammo = ammoGame.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='hard';
    state.aiAction={}; state.playerLevels=[1,2]; turns.reset(1); state.phase='turn-ready'; turns.createCurrentUnit();
    turns.currentUnit.status='resting'; turns.currentUnit.x=800;
    const enemy=new CurlingUnit({id:'enemy',owner:0,turnNumber:1,x:600,y:355}); enemy.status='resting';
    state.units.push(enemy); state.hands[1]=[{...deckCard('ammo'),instanceId:'ammo'}];
    ({used:aiUseFollowUpCard(turns.currentUnit),mode:state.repositionMode});`);
  assert.equal(ammo.used, true);
  assert.equal(ammo.mode, 'ammo');
});

test('AI difficulty changes planning breadth and launch precision', () => {
  const g = game();
  g.run(`state.currentMap=MAPS[0]; turns.reset(1); turns.createCurrentUnit();
    let samples=0; const original=aiPredictShot;
    aiPredictShot=(...args)=>{ samples++; return original(...args); };
    state.aiDifficulty='easy'; const easy=aiShotPlan(turns.currentUnit); const easySamples=samples;
    samples=0; state.aiDifficulty='hard'; const hard=aiShotPlan(turns.currentUnit);
    assert.ok(samples>easySamples*3);
    for (const plan of [easy,hard]) {
      assert.ok(plan.power>=0 && plan.power<=1);
      assert.ok(Number.isFinite(plan.aimPoint.x) && Number.isFinite(plan.aimPoint.y));
    }
    assert.ok(AI_LEVELS.easy.meterTolerance>AI_LEVELS.hard.meterTolerance);
    aiPredictShot=original;`);
});

test('rollout prediction tracks a real stone impact and the resulting scores', () => {
  const g = game();
  g.context.UCCAiPlanner = aiPlanner;
  const snapshot = g.run(`state.currentMap=MAPS[0]; state.phase='aiming'; turns.reset(1);
    const enemy=new CurlingUnit({id:'enemy',owner:0,turnNumber:1,x:800,y:355});
    enemy.status='resting'; state.units=[enemy]; turns.createCurrentUnit();
    aiPlannerSnapshot(turns.currentUnit);`);
  const predicted = aiPlanner.simulate(snapshot, {dx:-1,dy:0,power:.5});
  const actual = g.run(`turns.currentUnit.launch(-275*.5*CONFIG.launchScale,0);
    state.phase='sliding';
    for(let i=0;i<960;i++) {
      update(1/120,0,false);
      if(i>4 && state.units.every(unit=>unit.status!=='sliding')) break;
    }
    ({positions:state.units.map(unit=>unit.x),scores:calculateScores().map(result=>result.score)});`);
  assert.ok(Math.abs(predicted.world.units[0].x - actual.positions[0]) < 25);
  assert.ok(Math.abs(predicted.world.units[1].x - actual.positions[1]) < 25);
  assert.ok(Math.abs(predicted.scores[0] - actual.scores[0]) <= 3);
  assert.ok(Math.abs(predicted.scores[1] - actual.scores[1]) <= 3);
});

test('rollout prediction follows the ice and moving-wall map dynamics', () => {
  for (const mapIndex of [1, 2]) {
    const g = game();
    const snapshot = g.run(`state.currentMap=MAPS[${mapIndex}]; state.phase='aiming';
      state.mapTime=1.2; turns.reset(1); turns.createCurrentUnit();
      aiPlannerSnapshot(turns.currentUnit);`);
    const predicted = aiPlanner.simulate(snapshot, {dx:-1,dy:0,power:.5});
    const actual = g.run(`turns.currentUnit.launch(-275*.5*CONFIG.launchScale,0);
      state.phase='sliding';
      for(let i=0;i<1080;i++) {
        update(1/120,0,false);
        if(i>4 && state.units.every(unit=>unit.status!=='sliding')) break;
      }
      ({x:turns.currentUnit.x,status:turns.currentUnit.status,score:calculateScores()[1].score});`);
    const expected = predicted.world.units[0];
    assert.equal(expected.status, actual.status, `map ${mapIndex}`);
    assert.ok(Math.abs(expected.x - actual.x) < 65, `map ${mapIndex}: ${expected.x} vs ${actual.x}`);
    assert.ok(Math.abs(predicted.scores[1] - actual.score) < 10, `map ${mapIndex}`);
  }
});

test('AI tiers use their names, rewards, and progressively wider card sets', () => {
  const g = game();
  g.run(`for (const [difficulty, name, fame, count] of [
      ['easy','네오',25,7], ['normal','뉴트론',35,9], ['hard','AAB',75,10]]) {
      selectAiOpponent(difficulty); startAiGame();
      assert.equal(PLAYER[1].name,name);
      assert.equal(aiLevel().fame,fame);
      assert.equal(aiLevel().cards.length,count);
      assert.equal(state.playerDecks[1].length,8);
      assert.ok(state.playerDecks[1].every(id=>aiCanUseCard(id)));
      assert.equal(state.playerLevels[1],difficulty==='easy'?1:2);
      assert.equal(state.playerDecks[1].includes('data-barrier'),difficulty!=='easy');
    }`);
});

test('AI selection requires a portrait choice and uses the account or a stable random guest name', () => {
  const g = game();
  g.run(`guestProfile=null; guestAiNickname=null; selectAiOpponent(null);
    assert.equal(startAiButton.disabled,true);
    startAiGame(); assert.equal(state.aiMode,false);
    const first=aiPlayerName(); assert.match(first,/^방랑자 [0-9]{4}$/);
    assert.equal(aiPlayerName(),first);
    guestProfile={name:'설정한 이름',level:1}; assert.equal(aiPlayerName(),'설정한 이름');
    selectAiOpponent('normal'); assert.equal(startAiButton.disabled,false);
    startAiGame(); assert.equal(PLAYER[0].name,'설정한 이름');`);
});

test('local guest and account profiles are presented at level 100, including file-open mode', () => {
  const g = game();
  g.context.location.hostname = 'localhost';
  g.run(`document.createElement=()=>({append(){}});
    accountStats.replaceChildren=()=>{};
    [...localDeckSelects,aiDeckSelect].forEach(select=>select.replaceChildren=()=>{});
    renderGuestProfile({id:'LOCAL-ACCOUNT',username:'player_one',name:'로컬 계정',fame:0,level:1,
    levelStart:0,nextLevel:100,played:0,wins:0,losses:0,draws:0,decks:[null,null,null],activePreset:0},true);
    assert.equal(guestProfile.level,100);
    assert.equal(state.playerLevels[0],100);
    assert.match(document.querySelector('#guestProfileMeta').textContent,/Lv 100/);`);
  g.context.location.protocol = 'file:';
  g.run(`renderGuestProfile(createLocalGuestProfile('로컬 게스트'),false);
    assert.equal(guestProfile.username,null);
    assert.equal(guestProfile.level,100);
    assert.match(document.querySelector('#guestProfileMeta').textContent,/Lv 100/);`);
});

test('AI result offers a lobby exit without losing a pending account award', async () => {
  const g = game();
  g.run(`state.aiMode=true; state.phase='aiming'; turns.reset(0); turns.createCurrentUnit();
    finishGame(); assert.equal(resultLobbyButton.hidden,false);
    assert.equal(replayButton.hidden,false);
    resultLobbyButton.listeners.click();
    assert.equal(state.phase,'intro'); assert.equal(state.aiMode,false);
    assert.equal(resultOverlay.hidden,true); assert.equal(startOverlay.hidden,false);`);
  const pending = g.run(`guestProfile={username:'member',name:'MEMBER',level:1}; guestToken='token';
    state.aiMode=true; state.aiMatchId='match-id'; state.aiMatchToken='token';
    state.aiMatchPromise=Promise.resolve('match-id'); globalThis.awardRequested=false;
    renderGuestProfile=profile=>{ guestProfile=profile; };
    fetch=async(url,options)=>{ awardRequested=true; assert.equal(options.headers.Authorization,'Bearer token');
      return {ok:true,json:async()=>({award:{profile:{name:'MEMBER',level:1,fame:25},gained:25,previousLevel:1},persistent:true})}; };
    completeAiVictory([{score:60},{score:20}]);`);
  g.run('returnToHome()');
  await pending;
  g.run('assert.equal(awardRequested,true); assert.equal(guestProfile.fame,25);');
});

test('AI settings expose the shared exit control, confirm forfeiting, and record the forfeiture', async () => {
  const g = game();
  g.run(`state.aiMode=true; state.phase='aiming'; turns.reset(0); turns.createCurrentUnit();
    guestProfile={username:'member',name:'MEMBER',level:1}; guestToken='token';
    state.aiMatchToken='token'; state.aiMatchPromise=Promise.resolve('match-id');
    globalThis.requests=[]; fetch=async(url,options)=>{ requests.push({url,options}); return {ok:true}; };
    document.querySelector('#gameSettingsButton').listeners.click();
    assert.equal(gameLeaveActions.hidden,false);
    assert.equal(settingsAudioControls.hidden,false);
    assert.equal(gameSettingsMainActions.hidden,false);
    assert.equal(gameLeaveButton.textContent,'게임 포기하기');
    gameReturnButton.listeners.click();
    assert.equal(gameSettingsOverlay.hidden,true); assert.equal(state.phase,'aiming');
    document.querySelector('#gameSettingsButton').listeners.click();
    gameLeaveButton.listeners.click(); assert.equal(gameLeaveConfirm.hidden,false);
    assert.equal(settingsAudioControls.hidden,true); assert.equal(gameSettingsMainActions.hidden,true);
    assert.match(gameLeavePrompt.textContent,/명성치는 획득할 수 없습니다/);
    document.querySelector('#gameLeaveCancelButton').listeners.click();
    assert.equal(state.phase,'aiming'); assert.equal(gameLeaveConfirm.hidden,true); assert.equal(gameSettingsOverlay.hidden,true);
    document.querySelector('#gameSettingsButton').listeners.click();
    gameLeaveButton.listeners.click();
    document.querySelector('#gameLeaveConfirmButton').listeners.click();
    assert.equal(state.phase,'intro'); assert.equal(state.aiMode,false);`);
  await new Promise(resolve => setImmediate(resolve));
  g.run(`assert.equal(requests.length,1);
    assert.equal(requests[0].url,'/api/ai-matches/match-id/forfeit');
    assert.equal(requests[0].options.headers.Authorization,'Bearer token');`);
});

test('game header aligns map and settings with the title while online exit confirms room leave', async () => {
  const g = game();
  g.run(`state.aiMode=false; state.phase='aiming';
    onlineSession={code:'ABC123',token:'room-token'};
    globalThis.leftRoom=null;
    closeOnlineSocket=()=>{};
    postOnlineRequest=(url,body)=>{ leftRoom={url,body}; return Promise.resolve({ok:true}); };
    document.querySelector('#gameSettingsButton').listeners.click();
    assert.equal(gameLeaveActions.hidden,false);
    gameLeaveButton.listeners.click();
    assert.equal(settingsAudioControls.hidden,true);
    assert.match(gameLeavePrompt.textContent,/온라인 대전에서 나가면 패배 처리/);
    document.querySelector('#gameLeaveConfirmButton').listeners.click();
    assert.equal(onlineSession,null); assert.equal(state.phase,'intro');`);
  g.run(`assert.equal(leftRoom.url,'/api/rooms/ABC123/leave');
    assert.deepEqual(leftRoom.body,{token:'room-token'});`);
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
  assert.match(html,/<section class="topbar"[\s\S]*?<h1>Second Chance<\/h1>[\s\S]*?<div class="board-map">[\s\S]*?id="gameSettingsButton"[\s\S]*?<\/section>/);
  assert.doesNotMatch(html,/<div class="status-controls">[\s\S]*?id="gameSettingsButton"/);
  assert.match(html,/body\.game-active \.topbar \{[^}]*width: min\(100%, 71\.8vw\)/);
  assert.match(html,/\.board-dock \{[^}]*bottom: 64px[^}]*background:/);
  assert.doesNotMatch(html,/\.board-dock \{[^}]*border-top:/);
  assert.match(html,/<div class="board-hud"[\s\S]*?id="panel0"[\s\S]*?id="turnTimer"[\s\S]*?id="panel1"[\s\S]*?<\/div>\s*<canvas/);
  assert.match(html,/<div class="board-dock"[\s\S]*?id="remaining0"[\s\S]*?id="speedToggle"[\s\S]*?id="turnText"[\s\S]*?id="endTurnButton"/);
});

test('AI style changes hero priorities and can place a legal trigger only within its limit', () => {
  const g = game();
  g.run(`state.aiOwner=1; state.aiDifficulty='hard'; state.currentMap=MAPS[0];
    state.heroOffers[1]=['hunter','trap-master']; state.aiStyle='attacker';
    assert.equal(chooseAiHeroOffer(),'hunter'); state.aiStyle='controller';
    assert.equal(chooseAiHeroOffer(),'trap-master');
    state.heroChoices[1]='trap-master'; turns.reset(1); turns.createCurrentUnit(); state.triggerPlacementCount=[0,0];
    assert.equal(aiPlaceTrigger(),true); assert.equal(state.triggers.length,1);
    assert.ok(canPlaceItemTrigger({x:TABLE.left+90,y:TABLE.top+90}));
    assert.equal(aiPlaceTrigger(),true); assert.equal(state.triggers.length,2);
    assert.equal(aiPlaceTrigger(),false); assert.equal(state.triggers.length,2);`);
});

test('AI saves blackhole for a nearby target and hardens a stone headed off the table', () => {
  const g = game();
  g.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='hard'; state.aiStyle='attacker';
    state.currentMap=MAPS[0]; turns.reset(1); const unit=turns.createCurrentUnit();
    const enemy=new CurlingUnit({id:'enemy',owner:0,turnNumber:1,x:450,y:355});
    enemy.status='resting'; state.units.push(enemy);
    state.phase='aiming'; state.hands[1]=[{id:'blackhole',name:'블랙홀 방출',instanceId:'bh'}];
    assert.equal(aiUsePreparationCard(unit),false);
    assert.equal(state.hands[1].length,1);
    unit.x=540; unit.vx=-200; unit.vy=0; unit.status='sliding'; state.phase='sliding';
    assert.equal(aiUseInFlightCard(),true);
    assert.equal(state.hands[1].length,0);
    state.hands[1]=[{id:'hardening',name:'경질화',instanceId:'hard'}];
    unit.x=180; unit.vx=-900; unit.vy=0; unit.status='sliding';
    assert.equal(aiUseInFlightCard(),true);
    assert.equal(getUnitEffectStacks(unit,'hardening'),1);`);
});

test('catalog builds all entries from live definitions and returns to the home screen', () => {
  const g=game();
  g.run(`openCatalog(); assert.equal(learningUI.catalogList.children.length,cardDefinitions().length);
    renderCatalog('triggers'); assert.equal(learningUI.catalogList.children.length,ITEM_TRIGGERS.length);
    assert.equal(learningUI.triggerCatalogTab.getAttribute('aria-selected'),'true');
    returnToHome(); assert.equal(learningUI.catalogOverlay.hidden,true); assert.equal(startOverlay.hidden,false);`);
});

test('launch practice accepts 80 points, rejects a short shot and gives separate fall feedback', () => {
  const g=game();
  g.run(`startTutorial(); loadTutorialLesson(0,false);
    const place=(score)=>{const u=turns.currentUnit;u.x=TABLE.goalX+(1-score/100)*(TABLE.right-TABLE.goalX);u.status='resting';u.hasLaunched=true;recordTutorialEvent('launch');evaluateTutorialOutcome();};
    place(79); assert.equal(state.tutorial.complete,false);
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'launch-short');
    assert.equal(learningUI.tutorialNextButton.disabled,true);
    advanceTutorialDialogue(); assert.equal(state.tutorial.attempted,false);
    place(80); assert.equal(state.tutorial.complete,true); assert.equal(learningUI.tutorialNextButton.disabled,false);
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'launch-success');
    loadTutorialLesson(0,false); turns.currentUnit.status='fallen'; recordTutorialEvent('launch');evaluateTutorialOutcome();
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'launch-fall');`);
});

test('opponent practice requires a knockout and rejects losing the player stone', () => {
  const g=game();
  g.run(`startTutorial(); loadTutorialLesson(1,false);
    recordTutorialEvent('launch'); turns.currentUnit.status='sliding'; recordTutorialEvent('collision');
    evaluateTutorialOutcome(); assert.equal(state.tutorial.complete,false);
    state.units.find(u=>u.owner===1).status='fallen'; evaluateTutorialOutcome();
    assert.equal(state.tutorial.complete,true); assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'push-success');
    loadTutorialLesson(1,false); recordTutorialEvent('launch'); turns.currentUnit.status='fallen';
    evaluateTutorialOutcome(); assert.equal(state.tutorial.complete,false);
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'push-fail');`);
});

test('card practice grants one ammo, requires firing it, and retries with a fresh target and card', () => {
  const g=game();
  g.run(`startTutorial(); loadTutorialLesson(2,false);
    assert.equal(state.hands[0].length,1); assert.equal(state.hands[0][0].id,'ammo');
    assert.ok(state.turnDeadline>Date.now()); assert.equal(state.phase,'turn-ready');
    const u=turns.currentUnit; assert.equal(useCard(state.hands[0][0].instanceId,0,u),true);
    state.aimPoint={x:u.x+80,y:u.y}; launchCurrentUnit();
    assert.equal(state.tutorial.ammoFired,true); assert.equal(state.tutorial.complete,false);
    state.bullets=[]; state.units.forEach(stone=>stone.status='resting'); evaluateTutorialOutcome();
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'cards-fail');
    advanceTutorialDialogue(); assert.equal(state.hands[0].length,1); assert.equal(state.tutorial.ammoFired,false);
    recordTutorialEvent('ammo'); state.units.find(stone=>stone.owner===1).status='fallen'; evaluateTutorialOutcome();
    assert.equal(state.tutorial.complete,true); assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'cards-success');`);
});

test('card tutorial timeout automatically restores the exercise and pauses during dialogue', () => {
  const g=game();
  g.run(`startTutorial(); loadTutorialLesson(2);
    globalThis.remaining=turnTimeRemaining();`);
  g.wall(60000);
  g.run(`assert.ok(Math.abs(turnTimeRemaining()-remaining)<50);
    while(state.tutorial.dialogue) advanceTutorialDialogue();
    turnTimeRemaining(); state.turnDeadline=Date.now()-1; updateTurnTimer();
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'cards-timeout');
    assert.equal(state.turnDeadline,null);`);
  g.flush();
  g.run(`assert.equal(state.tutorial.index,2); assert.equal(state.tutorial.outcomeResolved,false);
    assert.ok(state.turnDeadline>Date.now()); assert.equal(state.hands[0][0].id,'ammo');
    assert.equal(state.units.find(u=>u.owner===1).status,'resting'); assert.equal(turns.globalTurn,0);`);
});

test('an edge-fired bullet can reenter the table and only expires after one continuous second outside', () => {
  const g=game();
  g.run(`turns.reset(); const cap=turns.createCurrentUnit();
    cap.x=TABLE.right+2; cap.status='resting'; cap.hasLaunched=true; cap.relaunchAvailable=true;
    state.phase='reposition'; state.repositionUnit=cap; state.repositionMode='ammo';
    state.aimPoint={x:cap.x+80,y:cap.y}; launchCurrentUnit();
    assert.equal(state.bullets.length,1);
    updateBullets(.05); assert.equal(state.bullets.length,1);
    assert.ok(state.bullets[0].x<TABLE.right);
    state.bullets[0].x=TABLE.left-10; state.bullets[0].vx=-300;
    updateBullets(.5); assert.equal(state.bullets.length,1);
    updateBullets(.45); assert.equal(state.bullets.length,1);
    updateBullets(.1); assert.equal(state.bullets.length,0);
  `);
});

test('trigger practice supplies a pulse and hardened opponent, and requires a trigger-assisted knockout', () => {
  const g=game();
  g.run(`startTutorial(); loadTutorialLesson(3,false);
    const target=state.units.find(u=>u.owner===1);
    assert.ok(target.x<TABLE.left+200); assert.equal(target.ability.stacks.hardening,1);
    assert.equal(state.triggers[0].type.id,'pulse'); assert.ok(state.triggers[0].x>target.x);
    assert.equal(state.triggerPlacementCount[0],0);
    recordTutorialEvent('launch'); recordTutorialEvent('trigger'); turns.currentUnit.status='sliding';
    evaluateTutorialOutcome(); assert.equal(state.tutorial.complete,false);
    target.status='fallen'; evaluateTutorialOutcome(); assert.equal(state.tutorial.complete,true);
    assert.equal(learningUI.tutorialNextButton.textContent,'튜토리얼 종료');
    advanceTutorialDialogue(); nextTutorialStep();
    assert.equal(tutorialUI.tutorialDialogue.dataset.lineId,'farewell');`);
});

test('pulse trigger detonates once at its cap after a unit collision', () => {
  const g = game();
  g.run(`const cap=new CurlingUnit({id:'cap',owner:0,turnNumber:1,x:620,y:355});
    const target=new CurlingUnit({id:'target',owner:1,turnNumber:1,x:565,y:355});
    cap.launch(-100,0); target.status='resting'; state.units=[cap,target];
    const type=ITEM_TRIGGERS.find(item=>item.id==='pulse');
    state.triggers=[{type,x:620,y:355,radius:CONFIG.unitRadius*.5}];
    update(.01,1000);
    assert.equal(state.triggers.length,0); assert.equal(cap.pendingPulseTriggers.length,0);
    assert.equal(state.effects.filter(effect=>effect.type==='pulse').length,1);
    assert.equal(sounds.filter(sound=>sound==='pulseCast').length,1);
    update(.6,1600); assert.equal(sounds.filter(sound=>sound==='pulseCast').length,1);`);
});

test('release card charges until a collision, halves allied knockback, and destroys nearby structures', () => {
  const g = game();
  g.run(`turns.reset(0); state.phase='turn-ready';
    const source=new CurlingUnit({id:'source',owner:0,turnNumber:1,x:620,y:350}); source.status='resting'; source.hasLaunched=true;
    const collidingEnemy=new CurlingUnit({id:'collider',owner:1,turnNumber:1,x:565,y:350}); collidingEnemy.status='resting';
    const ally=new CurlingUnit({id:'ally',owner:0,turnNumber:2,x:700,y:350}); ally.status='resting';
    const bystander=new CurlingUnit({id:'bystander',owner:1,turnNumber:2,x:620,y:450}); bystander.status='resting';
    state.units=[source,collidingEnemy,ally,bystander]; state.hands[0]=[{id:'pulse',name:'방출',instanceId:'release-card'}];
    state.bricks=[new BrickUnit({x:680,y:350,owner:1}),{unitKind:'brick',owner:1,x:620,y:500,vx:0,vy:0,width:36,height:100,mass:Infinity,restitution:.58,barrier:true,update(){}}];
    assert.equal(useCard('release-card',0,source),true); assert.equal(source.ability.pulse,true);
    updateAbilityEffects(20); assert.equal(source.ability.pulse,true); assert.equal(sounds.filter(sound=>sound==='pulseCast').length,0);
    resolveCollisions(); assert.equal(source.ability.pulse,false);
    assert.equal(sounds.filter(sound=>sound==='pulseCast').length,1);
    assert.equal(state.effects.filter(effect=>effect.type==='pulse').length,1);
    assert.ok(Math.hypot(ally.vx,ally.vy)>0); assert.ok(Math.hypot(bystander.vx,bystander.vy)>Math.hypot(ally.vx,ally.vy)*1.9);
    assert.equal(state.bricks.length,0);`);
});

test('release charge detonates on a bullet without inheriting its knockback', () => {
  const g = game();
  g.run(`const source=new CurlingUnit({id:'charged',owner:0,turnNumber:1,x:620,y:350}); source.status='resting'; source.hasLaunched=true;
    source.ability={pulse:true,stacks:{}}; state.units=[source];
    state.bullets=[{x:580,y:350,vx:400,vy:0,radius:5,mass:1,sourceUnitId:'shooter',outsideTime:0}];
    updateBullets(.1); assert.equal(state.bullets.length,0); assert.equal(source.ability.pulse,false);
    assert.equal(source.vx,0); assert.equal(source.vy,0);
    assert.equal(state.effects.filter(effect=>effect.type==='pulse').length,1);
    assert.equal(sounds.filter(sound=>sound==='pulseCast').length,1);`);
});

test('pulse trigger waits half a second without collision and each pickup detonates once', () => {
  const g = game();
  g.run(`const cap=new CurlingUnit({id:'cap',owner:0,turnNumber:1,x:620,y:355});
    cap.status='resting'; cap.hasLaunched=true; state.units=[cap];
    const type=ITEM_TRIGGERS.find(item=>item.id==='pulse');
    state.triggers=[{type,x:620,y:355,radius:CONFIG.unitRadius*.5},{type,x:620,y:355,radius:CONFIG.unitRadius*.5}];
    collectItemTriggers(); collectItemTriggers();
    assert.equal(cap.pendingPulseTriggers.length,2);
    update(.49,1000); assert.equal(sounds.filter(sound=>sound==='pulseCast').length,0);
    update(.01,1010); assert.equal(cap.pendingPulseTriggers.length,0);
    assert.equal(sounds.filter(sound=>sound==='pulseCast').length,2);
    update(.5,1510); assert.equal(sounds.filter(sound=>sound==='pulseCast').length,2);`);
});

test('pulse trigger fires on a cap-brick impact before its delay expires', () => {
  const g = game();
  g.run(`const cap=new CurlingUnit({id:'cap',owner:0,turnNumber:1,x:620,y:355});
    cap.launch(-100,0); state.units=[cap]; state.bricks=[new BrickUnit({x:585,y:355,owner:1})];
    const type=ITEM_TRIGGERS.find(item=>item.id==='pulse');
    state.triggers=[{type,x:620,y:355,radius:CONFIG.unitRadius*.5}];
    update(.01,1000); assert.equal(cap.pendingPulseTriggers.length,0);
    assert.equal(sounds.filter(sound=>sound==='pulseCast').length,1);
    update(.6,1600); assert.equal(sounds.filter(sound=>sound==='pulseCast').length,1);`);
});

test('map confirmation opens two-option hero selection before cards are dealt', () => {
  const g = game();
  g.run(`startLocalGame(); startSelectedMap();
    assert.equal(state.phase,'hero-select'); assert.equal(mapSelectOverlay.hidden,true);
    assert.equal(heroSelectOverlay.hidden,false); assert.equal(state.heroOffers[0].length,2);
    assert.equal(state.heroOffers[1].length,2); assert.equal(state.hands[0].length,0);
    assert.ok(state.heroDeadline>Date.now());
    chooseHero(0,state.heroOffers[0][0]); assert.equal(state.heroChoices[0],state.heroOffers[0][0]);`);
  g.flush();
  g.run(`assert.equal(state.heroSelectionOwner,1); chooseHero(1,state.heroOffers[1][1]);`);
  g.flush();
  g.run(`assert.equal(state.phase,'dealing'); assert.equal(heroSelectOverlay.hidden,true);
    assert.equal(state.heroChoices.filter(Boolean).length,2);`);
  g.flush(); g.flush();
  g.run(`assert.equal(state.phase,'aiming'); assert.ok(turns.currentUnit);`);
});

test('hero selection times out to one of the offered abilities', () => {
  const g = game();
  const deadline = g.run(`startHeroSelection('local'); chooseHero(0,state.heroOffers[0][0]); state.heroDeadline;`);
  g.flush();
  assert.equal(g.run('state.heroDeadline'), deadline);
  g.run(`assert.equal(state.heroSelectionOwner,1);
    state.heroDeadline=Date.now()-1; updateHeroSelection();
    assert.ok(state.heroOffers[1].includes(state.heroChoices[1]));`);
  assert.ok(deadline > Date.now());
  g.flush();
  g.run(`assert.equal(state.phase,'dealing');`);
});

test('hunter gets extra ammo as first and last-turn cards without consuming the deck', () => {
  const g = game();
  g.run(`state.heroChoices[0]='hunter'; turns.reset(0); state.decks[0]=DEFAULT_DECK_IDS.map(id=>({...deckCard(id)}));
    drawCardForPlayer(0,()=>{});`);
  g.flush();
  g.run(`assert.equal(state.hands[0][0].id,'ammo'); assert.equal(state.decks[0].length,8);
    turns.globalTurn=8; drawCardForPlayer(0,()=>{});`);
  g.flush();
  g.run(`assert.equal(state.hands[0][1].id,'ammo'); assert.equal(state.decks[0].length,8);
    assert.equal(state.heroCardDraws[0],2);`);
});

test('bag editor enforces eight cards, one doubled kind, and saved local presets', () => {
  const g = game();
  g.run(`openDeckEditor('homeScreen');
    assert.equal(deckSaveButton.disabled,true);
    for(const id of DEFAULT_DECK_IDS.slice(0,7)) addDeckCard(id);
    addDeckCard('hardening');
    assert.equal(deckDrafts[0].length,8);
    assert.equal(deckDrafts[0].filter(id=>id==='hardening').length,2);
    assert.equal(deckSaveButton.disabled,false);
    assert.equal(deckIsValid(deckDrafts[0]),true);
    savedDecks[0]=[...deckDrafts[0]];
    refreshLocalDeckSelects();
    localDeckSelects[0].value='0'; localDeckSelects[1].value='-1';
    startLocalGame();
    assert.equal(state.playerDecks[0].filter(id=>id==='hardening').length,2);
    assert.equal(state.playerDecks[1].filter(id=>id==='hardening').length,1);
    assert.equal(state.playerDecks[0].length,8);`);
});

test('players draw only from their own bag and drawn cards turn gray in bag view', () => {
  const g = game();
  g.run(`state.playerDecks=[['guard','pulse','brick','hardening','ammo','blackhole','bluffing','reposition'], [...DEFAULT_DECK_IDS]];
    dealCards();
    assert.equal(state.decks[0].length,7);
    assert.equal(state.decks[1].length,8);
    const drawn=state.playerDecks[0].find(id=>!state.decks[0].some(card=>card.id===id));
    openGameDeck(0);
    assert.equal(gameDeckOverlay.hidden,false);
    assert.equal(gameDeckList.children.length,8);
    assert.equal(gameDeckList.children.filter(tile=>tile.className.includes('drawn')).length,1);
    assert.equal(state.decks[1].length,8);`);
});

test('trap master gets two placements, big boy changes radius and friction, joker changes fall scoring', () => {
  const g = game();
  g.run(`state.heroChoices=['trap-master','big-boy'];
    assert.equal(remainingTriggerPlacements(0),2); spendTriggerPlacement(0);
    assert.equal(remainingTriggerPlacements(0),1); assert.equal(state.triggerPlacementUsed[0],false);
    spendTriggerPlacement(0); assert.equal(remainingTriggerPlacements(0),0);
    assert.equal(state.triggerPlacementUsed[0],true);
    const cap=new CurlingUnit({id:'big',owner:1,turnNumber:1,x:700,y:355});
    assert.equal(cap.radius,CONFIG.unitRadius*1.2);
    assert.ok(Math.abs(cap.frictionAtPosition()-state.currentMap.friction*1.35)<1e-10);
    state.heroChoices[0]='joker'; turns.reset(0); state.phase='sliding';
    const enemy=new CurlingUnit({id:'enemy',owner:1,turnNumber:1,x:700,y:355});
    settleFallenUnit(enemy); assert.equal(state.fallPoints[0],40);
    const own=new CurlingUnit({id:'own',owner:0,turnNumber:1,x:700,y:355});
    settleFallenUnit(own); settleFallenUnit(own);
    assert.equal(state.fallPoints[0],30); assert.equal(calculateScores()[0].score,30);`);
});

test('online hero offers and host-validated challenger choice arrive in snapshots', () => {
  const {host,guest,send} = onlinePair();
  host.run(`startHeroSelection('online');`); send(2);
  guest.run(`assert.equal(state.phase,'hero-select'); assert.equal(heroSelectOverlay.hidden,false);
    assert.equal(state.heroOffers[1].length,2); onlineSession.pendingActions=new Map();
    onlineSession.socket={readyState:1,bufferedAmount:0,send(){}};
    assert.equal(chooseHero(1,state.heroOffers[1][0]),true);
    assert.equal(state.heroChoices[1],null); assert.equal(state.heroPendingChoice,state.heroOffers[1][0]);`);
  host.run(`handleOnlineHostAction({playerIndex:1,action:{type:'hero',heroId:'invalid'}});
    assert.equal(state.heroChoices[1],null);
    handleOnlineHostAction({playerIndex:1,action:{type:'hero',heroId:state.heroOffers[1][0]}});
    chooseHero(0,state.heroOffers[0][0]);`);
  send(3);
  guest.run(`assert.equal(state.heroChoices[1],state.heroOffers[1][0]); assert.equal(state.heroPendingChoice,null);`);
  host.flush(); send(4);
  guest.run(`assert.equal(state.phase,'dealing'); assert.equal(heroSelectOverlay.hidden,true);`);
});

test('host auto-selects both online heroes after the shared deadline', () => {
  const {host,guest,send} = onlinePair();
  host.run(`startHeroSelection('online'); state.heroDeadline=Date.now()-1; updateHeroSelection();
    assert.ok(state.heroOffers[0].includes(state.heroChoices[0]));
    assert.ok(state.heroOffers[1].includes(state.heroChoices[1]));`);
  send(2);
  guest.run(`assert.equal(state.phase,'hero-select'); assert.equal(state.heroChoices.filter(Boolean).length,2);`);
  host.flush(); send(3);
  guest.run(`assert.equal(state.phase,'dealing');`);
});

test('trap master can place twice through the normal trigger flow and not a third time', () => {
  const g = game();
  g.run(`state.heroChoices[0]='trap-master'; turns.createCurrentUnit(); state.phase='aiming';
    openTriggerTypeSelection({x:400,y:300},0); state.selectedTriggerType='guard'; confirmItemTriggerPlacement();
    assert.equal(state.triggers.length,1); assert.equal(remainingTriggerPlacements(0),1);
    openTriggerTypeSelection({x:500,y:300},0); state.selectedTriggerType='pulse'; confirmItemTriggerPlacement();
    assert.equal(state.triggers.length,2); assert.equal(remainingTriggerPlacements(0),0);
    openTriggerTypeSelection({x:600,y:300},0); state.selectedTriggerType='blackhole'; confirmItemTriggerPlacement();
    assert.equal(state.triggers.length,2); assert.equal(state.triggerPlacementCount[0],2);`);
});

test('hero choices remain active through the second online round', () => {
  const {host} = onlinePair();
  host.run(`state.heroChoices=['hunter','trap-master']; onlineSession.roundIndex=1;
    startOnlineRound(1); assert.equal(state.phase,'dealing');
    assert.equal(state.heroChoices[0],'hunter'); assert.equal(state.heroChoices[1],'trap-master');
    assert.equal(remainingTriggerPlacements(1),2);`);
  host.flush(); host.flush();
  host.run(`assert.equal(turns.startingPlayer,1); assert.equal(state.heroChoices[0],'hunter');`);
});

test('joker pays the fall penalty on an expired unlaunched turn', () => {
  const g = game();
  g.run(`state.heroChoices[0]='joker'; turns.createCurrentUnit(); state.phase='aiming';
    state.turnDeadline=Date.now()-1; expireCurrentTurn();
    assert.equal(state.units[0].status,'fallen'); assert.equal(state.fallPoints[0],-10);`);
});

test('tutorial skip unlocks reposition and adventure, while returning from skip confirmation keeps the exercise', async () => {
  const g=game();
  g.run(`guestProfile=createLocalGuestProfile('신입'); renderGuestProfile(guestProfile,false);
    assert.equal(isCardUnlocked(deckCard('reposition'),0),false);
    assert.equal(defaultPlayerDeck().includes('reposition'),false);
    startTutorial(); closeTutorialDialogue(); state.tutorial.settingsReady=true;
    document.querySelector('#gameSettingsButton').listeners.click();
    document.querySelector('#tutorialSkipButton').listeners.click();
    assert.match(gameLeavePrompt.textContent,/스킵하시겠습니까/);
    assert.equal(settingsAudioControls.hidden,true);
    document.querySelector('#gameLeaveCancelButton').listeners.click();
    assert.equal(gameSettingsOverlay.hidden,true); assert.ok(state.tutorial);
    assert.equal(guestProfile.tutorialCompleted,false);`);
  await g.run('completeTutorial()');
  g.run(`assert.equal(guestProfile.tutorialCompleted,true); assert.equal(guestProfile.adventureUnlocked,true);
    assert.equal(isCardUnlocked(deckCard('reposition'),0),true);
    assert.equal(defaultPlayerDeck().includes('reposition'),true);
    assert.equal(tutorialUI.tutorialRewardOverlay.hidden,false);
    assert.match(tutorialUI.tutorialRewardTitle.textContent,/재배치/);
    tutorialUI.tutorialRewardNext.listeners.click();
    assert.match(tutorialUI.tutorialRewardTitle.textContent,/모험/);
    tutorialUI.tutorialRewardNext.listeners.click(); assert.equal(state.tutorial,null);
    renderCatalog('heroes'); assert.equal(learningUI.catalogList.children.length,HEROES.length);`);
});

test('hero portraits appear on the matching selection cards and catalog entries', () => {
  const g = game();
  const portraits = g.run('HEROES.map(hero => hero.portrait)');
  portraits.forEach(portrait => assert.ok(fs.existsSync(path.join(__dirname, '..', portrait))));
  g.run(`startHeroSelection('local'); state.heroOffers[0]=['trap-master','hunter']; renderHeroSelection();`);
  const options = g.elements.get('#heroOptions').children;
  assert.equal(options.length, 2);
  assert.equal(options[0].children[0].src, '영웅 초상화/trap master.png');
  assert.equal(options[0].children[1].children[0].textContent, '트랩 마스터');
  assert.equal(options[1].children[0].src, '영웅 초상화/hunter.png');
  options[0].listeners.click();
  assert.equal(g.run('state.heroChoices[0]'), 'trap-master');
  g.run(`renderCatalog('heroes');`);
  const entries = g.elements.get('#catalogList').children;
  assert.equal(entries.length, portraits.length);
  entries.forEach((entry, index) => assert.equal(entry.children[0].children[0].src, portraits[index]));
});

test('data barrier unlocks at level two, appears locked in the catalog, and uses the final art', () => {
  const g = game();
  g.run(`state.playerLevels=[1,1]; renderCatalog('cards');
    assert.equal(deckCard('data-barrier').unlockLevel,2);
    assert.equal(CARD_PRESENTATION['data-barrier'].art,'Card_illustration/Data Barrier-v5.png');
    assert.equal(CARD_DESCRIPTIONS['data-barrier'],'내 스톤만 통과 가능한 특수 장벽을 배치합니다. 장벽은 다음 상대 턴까지 유지됩니다.');
    assert.equal(isCardUnlocked(deckCard('data-barrier'),0),false);
    state.playerLevels[0]=2; assert.equal(isCardUnlocked(deckCard('data-barrier'),0),true);`);
  assert.ok(fs.existsSync(path.join(__dirname, '../Card_illustration/Data Barrier-v5.png')));
});

test('data barrier is fixed, friendly stones pass, enemies collide, and bullets destroy it', () => {
  const g = game();
  g.run(`state.currentMap=MAPS[0]; state.playerLevels=[2,2]; turns.reset(0);
    turns.createCurrentUnit(); state.phase='aiming';
    state.hands[0]=[{...deckCard('data-barrier'),instanceId:'barrier-card'}];
    assert.equal(placeStructureCard('barrier-card',0,{x:500,y:355}),true);
    const barrier=state.bricks[0]; assert.equal(barrier.barrier,true);
    assert.equal(barrier.width,18); assert.equal(barrier.height,64);
    const own=new CurlingUnit({id:'own',owner:0,turnNumber:1,x:500,y:355});
    own.status='resting'; own.vx=-100; state.units=[own];
    resolveBrickCollisions(); assert.equal(own.x,500); assert.equal(own.vx,-100);
    const enemy=new CurlingUnit({id:'enemy',owner:1,turnNumber:1,x:500,y:355});
    enemy.status='resting'; enemy.vx=-100; state.units=[enemy];
    resolveBrickCollisions(); assert.notEqual(enemy.x,500);
    assert.equal(barrier.x,500); assert.equal(barrier.y,355);
    triggerPulse(enemy); triggerBlackHole(enemy); barrier.update(.5);
    assert.equal(barrier.x,500); assert.equal(barrier.y,355);
    state.bullets=[{x:460,y:355,vx:900,vy:0,radius:7,sourceUnitId:'enemy',outsideTime:0}];
    updateBullets(.1); assert.equal(state.bricks.length,0); assert.equal(state.bullets.length,0);`);
});

test('data barriers use player-relative colors and expose structure hover descriptions', () => {
  const g = game();
  g.run(`onlineSession={started:true,playerIndex:0};
    const ownPalette=getBarrierPalette({owner:0});
    const enemyPalette=getBarrierPalette({owner:1});
    assert.equal(ownPalette.fill,'#17454c');
    assert.equal(enemyPalette.fill,'#4b252b');
    assert.match(enemyPalette.outline,/255, 150, 160/);
    const canvas=document.querySelector('#game');
    canvas.parentElement=document.createElement('div');
    state.phase='turn-ready';
    state.bricks=[new BrickUnit({x:500,y:355,owner:1,barrier:true}),
      new BrickUnit({x:600,y:355,owner:1,barrier:false})];
    updateEntityTooltip({clientX:500,clientY:355,pointerType:'mouse'});
    assert.equal(document.querySelector('#entityTooltipTitle').textContent,'데이터 장벽');
    assert.equal(document.querySelector('#entityTooltipDetail').textContent,'자신의 스톤만 통과할 수 있는 이동 불가능한 구조물입니다.');
    updateEntityTooltip({clientX:600,clientY:355,pointerType:'mouse'});
    assert.equal(document.querySelector('#entityTooltipTitle').textContent,'벽돌 유닛');
    assert.equal(document.querySelector('#entityTooltipDetail').textContent,'충돌 판정이 있고, 밀려날 수 있는 벽돌 유닛입니다.');`);
});

test('data barriers continuously emit owner-colored capped particles', () => {
  const g = game();
  g.run(`onlineSession={started:true,playerIndex:0};
    state.bricks=[new BrickUnit({x:500,y:355,owner:0,barrier:true}),new BrickUnit({x:600,y:355,owner:1,barrier:true})];
    state.particles=[]; emitBarrierParticles(.5);
    assert.ok(state.particles.length >= 8);
    assert.ok(state.particles.every(particle => particle.barrierParticle));
    assert.ok(state.particles.some(particle => ['#ffe1e3','#f07882'].includes(particle.color)));
    state.particles=Array.from({length:240},()=>({life:1,vx:0,vy:0}));
    emitBarrierParticles(.5); assert.ok(state.particles.length<=240);`);
});

test('data barrier survives its owner turn, expires at the next opponent turn end, and syncs online', () => {
  const {host, guest, send} = onlinePair();
  host.run(`state.playerLevels=[2,2]; state.hands[1]=[{...deckCard('data-barrier'),instanceId:'online-barrier'}];
    assert.equal(placeStructureCard('online-barrier',1,{x:500,y:355}),true);
    assert.equal(state.bricks[0].expiresAtTurn,turns.globalTurn+2);`);
  send(2);
  guest.run(`assert.equal(state.bricks.length,1); assert.equal(state.bricks[0].barrier,true);
    assert.equal(state.bricks[0].owner,1);`);
  host.run(`turns.finishCurrentTurn(); assert.equal(state.bricks.length,1);
    turns.finishCurrentTurn(); assert.equal(state.bricks.length,0);`);
  send(3);
  guest.run(`assert.equal(state.bricks.length,0);`);
});

test('Neutron and AAB can spend the data barrier on a legal AI turn, but Neo cannot', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const g = game();
    g.run(`state.aiMode=true; state.aiOwner=1; state.aiDifficulty='${difficulty}';
      state.aiStyle='controller'; state.playerLevels=[2,${difficulty === 'easy' ? 1 : 2}];
      state.currentMap=MAPS[0]; turns.reset(1); turns.createCurrentUnit(); state.phase='aiming';
      const enemy=new CurlingUnit({id:'target',owner:0,turnNumber:1,x:550,y:355});
      enemy.status='resting'; state.units.push(enemy);
      state.hands[1]=[{...deckCard('data-barrier'),instanceId:'ai-barrier'}];
      Math.random=()=>0;
      assert.equal(aiPlaceBrick(),${difficulty !== 'easy'});
      assert.equal(state.bricks.length,${difficulty === 'easy' ? 0 : 1});
      if(state.bricks.length) assert.equal(state.bricks[0].barrier,true);`);
  }
});
