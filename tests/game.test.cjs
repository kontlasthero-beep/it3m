const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function game() {
  const elements = new Map();
  const timeouts = [];
  let time = 1000;
  function element() {
    const attrs = {};
    return {
      style: {}, dataset: {}, hidden: false, value: '', checked: false, width: 1200, height: 710,
      classList: { add() {}, remove() {}, toggle() {} }, listeners: {}, children: [],
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(key, value) { attrs[key] = value; }, getAttribute(key) { return attrs[key]; },
      append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = items; },
      querySelector() { return element(); }, querySelectorAll() { return []; },
      getContext() { return new Proxy({}, { get: () => () => {} }); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 710 }; },
      focus() {}, remove() {}, setPointerCapture() {}, contains() { return false; }
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
    performance: { now: () => time }, Date, console, assert, URL, WebSocket: { OPEN: 1 },
    requestAnimationFrame() {}, setTimeout(fn) { timeouts.push(fn); return timeouts.length; }, clearTimeout() {},
    setInterval() { return 1; }, clearInterval() {}, crypto: { randomUUID: () => 'test-id' }
  });
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, 'globalThis.run = code => eval(code); })();'), context);
  context.run(`globalThis.sounds = []; playSound = name => sounds.push(name); playFileSound = name => sounds.push(name);`);
  return { run: context.run, elements, tick: ms => { time += ms; }, flush: () => timeouts.splice(0).forEach(fn => fn()) };
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
    state.aiming=true; state.aimPoint={x:1100,y:355};`);
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
    assert.deepEqual(schedule,[1,0,1,0,1,0,1,0]); onlineSession.roundIndex=2;
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
    assert.match(learningUI.tutorialInstruction.textContent,/병뚜껑을 오른쪽으로/);
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
