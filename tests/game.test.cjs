const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
  const elements = new Map();
  const timeouts = [];
  let time = 1000;
  let wallOffset = 0;
  function element() {
    const attrs = {};
    return {
      style: {}, dataset: {}, hidden: false, value: '', checked: false, width: 1200, height: 710,
      classList: { add() {}, remove() {}, toggle() {} }, listeners: {}, children: [],
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(key, value) { attrs[key] = value; }, getAttribute(key) { return attrs[key]; },
      append(...items) { for (const item of items) { item.remove(); item.parentNode = this; this.children.push(item); } },
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
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.run = code => eval(code); })();'), context);
  context.run(`globalThis.sounds = []; playSound = name => sounds.push(name); playFileSound = name => sounds.push(name);`);
  return { run: context.run, elements, tick: ms => { time += ms; }, wall: ms => { wallOffset += ms; },
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

test('ice friction rises by 20 percent and catalog uses the card illustration files', () => {
  const g = game();
  g.run(`assert.ok(Math.abs(MAPS[1].friction/.007115625-1.2)<1e-10);
    renderCatalog('cards');
    const cards=cardDefinitions();
    cards.forEach((card,index)=>{
      const image=learningUI.catalogList.children[index].children[0].children[0];
      assert.equal(image.src,CARD_PRESENTATION[card.id].art);
      assert.equal(image.dataset.cardId,card.id);
    });`);
});

test('background draw completes exactly once and resets cancel stale draw callbacks', () => {
  const g = game();
  g.run(`globalThis.completed=0; state.deck=[{id:'guard',name:'방호벽'}];
    drawCardForPlayer(0,()=>{completed++;state.phase='aiming';});
    assert.equal(cardDrawVisual.card.id,'guard');`);
  g.tick(1600); g.run('advanceGameClock(performance.now())'); g.flush();
  g.run(`assert.equal(completed,1); assert.equal(state.hands[0].length,1);
    assert.equal(state.hands[0][0].id,'guard');
    state.deck=[{id:'ammo',name:'총알 장전'}]; drawCardForPlayer(0,()=>completed++); clearPracticeBoard();`);
  g.tick(1600); g.run('advanceGameClock(performance.now())'); g.flush();
  g.run('assert.equal(completed,1); assert.equal(state.hands[0].length,0)');
});

test('draw snapshot shares both players cards without restarting its animation', () => {
  const {host, guest, send} = onlinePair();
  host.run(`state.deck=[{id:'guard',name:'방호벽'}]; drawCardForPlayer(0,()=>{});
    assert.equal(createOnlineSnapshot().cardDraw.card.id,'guard');`);
  host.flush();
  host.run(`state.deck=[{id:'hardening',name:'경질화'}]; drawCardForPlayer(1,()=>{});`);
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

test('ammo aims linearly without shaking or stretch cues and launches at 300 percent', () => {
  const g = game();
  g.run(`turns.createCurrentUnit(); const cap=turns.currentUnit; cap.status='resting';
    state.hands[0]=[{id:'ammo',name:'Ammo',instanceId:'ammo1'}]; state.phase='turn-ready';
    assert.equal(useCard('ammo1',0,cap),true); state.aiming=true;
    updateAimFromInput(cap,{x:cap.x+CONFIG.maxPullDistance*.9,y:cap.y});
    assert.ok(Math.abs(state.aimTension-.9)<1e-10);
    updateAimFromInput(cap,{x:cap.x+CONFIG.maxPullDistance*2,y:cap.y});
    assert.equal(state.aimTension,1); drawAim(); globalThis.firstPath=aimPath.getAttribute('d');`);
  g.tick(50);
  g.run(`drawAim(); assert.equal(aimPath.getAttribute('d'),firstPath);
    assert.ok(!sounds.includes('elasticStretch')); launchCurrentUnit();
    assert.equal(state.bullets.length,1);
    assert.equal(Math.hypot(state.bullets[0].vx,state.bullets[0].vy),CONFIG.maxLaunchSpeed*3);
    assert.equal(turns.currentUnit.vx,0); assert.ok(sounds.includes('ammoFire')); assert.ok(!sounds.includes('launch'));`);
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
    globalThis.tones=[]; sfxToggle.checked=true; initializeAudio=()=>true;
    audio.context={currentTime:0}; scheduleTone=(...args)=>tones.push(args);
    assert.equal(startPowerMeter(),true); assert.equal(lockPowerMeter(.2),true); const low=tones.at(-1);
    state.powerMeter=null; assert.equal(startPowerMeter(),true); assert.equal(lockPowerMeter(.9),true); const high=tones.at(-1);
    assert.equal(tones.length,2);
    assert.ok(high[0]>low[0]); assert.ok(high[5]>low[5]);
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
    updateHud(); assert.match(scoreEls[0].textContent,/^점수 /);
    assert.doesNotMatch(scoreEls[0].textContent,/거리/);
    assert.doesNotMatch(HEROES.find(hero=>hero.id==='big-boy').description,/파워 미터/);`);
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

test('tutorial lessons cover every card and trigger; practice uses fixed hands without a timer', () => {
  const g = game();
  g.run(`startTutorial(); assert.equal(state.tutorial.index,0); assert.equal(state.turnDeadline,null);
    const lessons=tutorialLessons();
    for (const card of cardDefinitions()) {
      const index=lessons.findIndex(l=>l.kind==='card' && l.elementId===card.id);
      assert.ok(index>=0); loadTutorialLesson(index);
      assert.equal(state.hands[0][0].id,card.id); assert.equal(state.turnDeadline,null);
      if(card.id!=='brick') {
        for(let use=0; use<(lessons[index].requiredUses||1); use++) {
          assert.equal(useCard(state.hands[0][0].instanceId,0,turns.currentUnit),true);
        }
        if(['ammo','reposition'].includes(card.id)) {
          if(card.id==='reposition') { startPowerMeter(); lockPowerMeter(.5); }
          state.aimPoint={x:turns.currentUnit.x+100,y:turns.currentUnit.y}; launchCurrentUnit();
        }
        assert.equal(state.tutorial.complete,true);
      }
    }
    for(const trigger of ITEM_TRIGGERS) {
      loadTutorialLesson(lessons.findIndex(l=>l.kind==='trigger' && l.elementId===trigger.id));
      const cap=turns.currentUnit; cap.x=state.triggers[0].x; cap.previousX=cap.x+30; cap.status='sliding'; cap.hasLaunched=true;
      collectItemTriggers(); assert.equal(state.tutorial.complete,true); assert.equal(state.triggers.length,0);
    }`);
});

test('tutorial settings pause movement, return home clears practice, and normal play restores timed turns', () => {
  const g = game();
  g.run(`setSpeedLevel(0); startTutorial(); loadTutorialLesson(tutorialLessons().findIndex(l=>l.id==='walls'));
    turns.currentUnit.launch(-200,0); state.phase='sliding';
    learningUI.tutorialSettingsButton.listeners.click(); const x=turns.currentUnit.x;
    gameLoop(1100); assert.equal(turns.currentUnit.x,x);
    document.querySelector('#tutorialResumeButton').listeners.click(); gameLoop(1150);
    assert.ok(turns.currentUnit.x<x);
    returnToHome(); assert.equal(state.tutorial,null); assert.equal(state.phase,'intro');
    assert.equal(state.units.length,0); assert.equal(state.hands[0].length,0);
    assert.equal(state.speedLevel,0); assert.equal(PLAYER[0].name,'플레이어 1');
    assert.equal(learningUI.tutorialPanel.hidden,true);
    beginRound(); assert.equal(turns.currentUnit.owner,0); assert.ok(state.turnDeadline>Date.now());`);
});

test('catalog builds all entries from live definitions and returns to the home screen', () => {
  const g=game();
  g.run(`openCatalog(); assert.equal(learningUI.catalogList.children.length,cardDefinitions().length);
    renderCatalog('triggers'); assert.equal(learningUI.catalogList.children.length,ITEM_TRIGGERS.length);
    assert.equal(learningUI.triggerCatalogTab.getAttribute('aria-selected'),'true');
    returnToHome(); assert.equal(learningUI.catalogOverlay.hidden,true); assert.equal(startOverlay.hidden,false);`);
});

test('basic tutorial objectives follow real launches, collisions, resting and turn completion', () => {
  const g=game();
  g.run(`startTutorial();
    startPowerMeter(); lockPowerMeter(.5);
    state.aimPoint={x:turns.currentUnit.x+80,y:turns.currentUnit.y}; launchCurrentUnit();
    assert.equal(state.tutorial.complete,true);
    loadTutorialLesson(1); assert.equal(state.tutorial.complete,false);
    turns.currentUnit.launch(-1,0); state.phase='sliding'; update(1/60,1000);
    assert.equal(state.tutorial.complete,true);
    loadTutorialLesson(2);
    const target=state.units.find(u=>u.owner===1);
    turns.currentUnit.x=target.x+CONFIG.unitRadius*2-1;
    turns.currentUnit.launch(-100,0); resolveCollisions();
    assert.equal(state.tutorial.complete,true);
    loadTutorialLesson(3); assert.ok(state.turnDeadline>Date.now()); endTurn(); assert.equal(state.tutorial.complete,false);
    turns.currentUnit.launch(-1,0); state.phase='sliding'; update(1/60,1000); endTurn();
    assert.equal(state.tutorial.complete,true); assert.equal(turns.globalTurn,0);`);
});

test('tutorial navigation restores instructions, retry resets practice, and launch clears the aim overlay', () => {
  const g=game();
  g.run(`startTutorial();
    assert.match(learningUI.tutorialInstruction.textContent,/발사 버튼을 누른 뒤/);
    assert.equal(tutorialShowsPlacementLimit(),false);
    const guardIndex=tutorialLessons().findIndex(lesson=>lesson.id==='card-guard');
    learningUI.tutorialLessonSelect.listeners.change({target:{value:String(guardIndex)}});
    assert.equal(state.tutorial.index,guardIndex);
    assert.match(learningUI.tutorialInstruction.textContent,/위성 방호벽 2개/);
    assert.equal(state.hands[0].length,2);
    turns.currentUnit.x=700;
    document.querySelector('#tutorialRetryButton').listeners.click();
    assert.equal(turns.currentUnit.x,860);
    assert.equal(state.hands[0].length,2);
    assert.equal(state.tutorial.complete,false);
    loadTutorialLesson(tutorialLessons().findIndex(lesson=>lesson.id==='card-brick'));
    assert.equal(tutorialShowsPlacementLimit(),true);
    loadTutorialLesson(tutorialLessons().findIndex(lesson=>lesson.kind==='trigger'));
    assert.equal(tutorialShowsPlacementLimit(),true);
    loadTutorialLesson(0);
    startPowerMeter(); lockPowerMeter(.5);
    state.aiming=true; state.aimPoint={x:turns.currentUnit.x+1,y:turns.currentUnit.y};
    aimOverlay.style.display='block'; launchCurrentUnit();
    assert.equal(turns.currentUnit.status,'ready');
    assert.equal(state.aiming,false); assert.equal(aimOverlay.style.display,'none');
    state.aiming=true; state.aimPoint={x:turns.currentUnit.x+80,y:turns.currentUnit.y};
    aimOverlay.style.display='block'; launchCurrentUnit();
    assert.equal(state.aiming,false); assert.equal(state.aimPoint,null);
    assert.equal(aimOverlay.style.display,'none'); assert.equal(state.tutorial.complete,true);
  `);
});

test('tutorial timer restarts at zero without advancing the turn', () => {
  const g=game();
  g.run(`startTutorial(); loadTutorialLesson(tutorialLessons().findIndex(lesson=>lesson.id==='turn'));
    const cap=turns.currentUnit; const turn=turns.globalTurn;
    state.turnDeadline=Date.now()-1; updateTurnTimer();
    assert.ok(state.turnDeadline>Date.now());
    assert.equal(turns.currentUnit,cap); assert.equal(turns.globalTurn,turn);
    assert.equal(cap.status,'ready');
  `);
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

test('speed tutorial supplies blackhole and completes only after using it in flight', () => {
  const g = game();
  g.run(`startTutorial(); const index=tutorialLessons().findIndex(lesson=>lesson.id==='speed-card');
    loadTutorialLesson(index); assert.equal(state.tutorial.lesson.title,'게임 속도 조절');
    assert.match(learningUI.tutorialInstruction.textContent,/발사 도중 블랙홀 방출 카드를 사용해 보세요/);
    assert.equal(state.hands[0][0].id,'blackhole');
    setSpeedLevel(2); assert.equal(state.tutorial.complete,false);
    startPowerMeter(); lockPowerMeter(.5);
    state.aimPoint={x:turns.currentUnit.x+80,y:turns.currentUnit.y}; launchCurrentUnit();
    assert.equal(state.tutorial.complete,false); assert.equal(state.phase,'sliding');
    assert.equal(useCard(state.hands[0][0].instanceId,0,turns.currentUnit),true);
    assert.equal(state.tutorial.complete,true);`);
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
  g.run(`state.heroChoices[0]='hunter'; turns.reset(0); state.deck=CARDS.map(card=>({...card}));
    drawCardForPlayer(0,()=>{});`);
  g.flush();
  g.run(`assert.equal(state.hands[0][0].id,'ammo'); assert.equal(state.deck.length,CARDS.length);
    turns.globalTurn=8; drawCardForPlayer(0,()=>{});`);
  g.flush();
  g.run(`assert.equal(state.hands[0][1].id,'ammo'); assert.equal(state.deck.length,CARDS.length);
    assert.equal(state.heroCardDraws[0],2);`);
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

test('hero tutorial opens the selector and catalog lists all abilities', () => {
  const g = game();
  g.run(`startTutorial(); loadTutorialLesson(tutorialLessons().findIndex(lesson=>lesson.id==='hero-selection'));
    assert.equal(state.phase,'hero-select'); assert.equal(heroSelectOverlay.hidden,false);
    chooseHero(0,state.heroOffers[0][0]);`);
  g.flush();
  g.run(`assert.equal(state.tutorial.complete,true); assert.equal(state.phase,'aiming');
    renderCatalog('heroes'); assert.equal(learningUI.catalogList.children.length,HEROES.length);
    assert.equal(learningUI.heroCatalogTab.getAttribute('aria-selected'),'true');`);
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
