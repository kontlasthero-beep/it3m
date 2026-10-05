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
