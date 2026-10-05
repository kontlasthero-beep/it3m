const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { WebSocket } = require('ws');

test('public room lifecycle, admission races and WebSocket delivery', { timeout: 20000 }, async t => {
  const reservation=net.createServer();
  reservation.listen(0,'127.0.0.1'); await once(reservation,'listening');
  const port=reservation.address().port;
  await new Promise(resolve=>reservation.close(resolve));
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']
  });
  const sockets=[];
  t.after(async()=>{
    for(const socket of sockets) socket.terminate();
    const closed=once(child,'exit'); child.kill(); await closed;
  });
  await new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{if(String(chunk).includes('listening')) resolve();});
    child.on('error',reject); child.on('exit',code=>reject(new Error(`Server exited ${code}`)));
  });
  const base=`http://127.0.0.1:${port}`;
  async function api(route,body) {
    const response=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,headers:response.headers,data:await response.json()};
  }
  const host=(await api('/api/rooms',{name:'TEST-HOST',isPublic:true})).data;
  const roomPath=`/api/rooms/${host.code}`;
  await t.test('new room is listed with no-store response',async()=>{
    const listing=await api('/api/rooms');
    assert.equal(listing.headers.get('cache-control'),'no-store');
    assert.ok(listing.data.rooms.some(r=>r.code===host.code));
  });
  let challenger;
  await t.test('concurrent joins reserve exactly one seat; full room is hidden',async()=>{
    const attempts=await Promise.all([api(roomPath+'/join',{name:'A'}),api(roomPath+'/join',{name:'B'})]);
    assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
    challenger=attempts.find(r=>r.status===200).data;
    assert.ok(!(await api('/api/rooms')).data.rooms.some(r=>r.code===host.code));
  });
  await t.test('host map remains selected after challenger leaves, room reopens',async()=>{
    assert.equal((await api(roomPath+'/map',{token:host.token,mapId:'moving-walls'})).status,200);
    await api(roomPath+'/leave',{token:challenger.token});
    assert.ok((await api('/api/rooms')).data.rooms.some(r=>r.code===host.code));
    const join=await api(roomPath+'/join',{name:'C'}); assert.equal(join.status,200); challenger=join.data;
    assert.equal(challenger.room.host.mapId,'moving-walls');
  });
  await t.test('locked listed rooms require the correct password',async()=>{
    const locked=(await api('/api/rooms',{name:'LOCKED',isPublic:true,password:'test-password'})).data;
    const listed=(await api('/api/rooms')).data.rooms.find(r=>r.code===locked.code);
    assert.equal(listed.locked,true);
    assert.equal((await api(`/api/rooms/${locked.code}/join`,{name:'D',password:'wrong'})).status,403);
    assert.equal((await api(`/api/rooms/${locked.code}/join`,{name:'D',password:'test-password'})).status,200);
  });
  await t.test('WebSocket forwards snapshots repeatedly, including aiming state',async()=>{
    await api(roomPath+'/map',{token:challenger.token,mapId:'classic'});
    assert.equal((await api(roomPath+'/start',{token:host.token})).status,200);
    async function connect(token) {
      const ws=new WebSocket(`ws://127.0.0.1:${port}/api/socket?code=${host.code}&token=${token}`);
      sockets.push(ws); await once(ws,'open'); return ws;
    }
    const a=await connect(host.token),b=await connect(challenger.token);
    const received=[];
    const complete=new Promise(resolve=>b.on('message',raw=>{
      const message=JSON.parse(raw); if(message.type==='snapshot') received.push(message);
      if(received.length===20) resolve();
    }));
    for(let revision=1;revision<=20;revision++) a.send(JSON.stringify({type:'snapshot',revision,snapshot:{aiming:true,mapTime:revision/20}}));
    await complete; assert.equal(received.at(-1).snapshot.mapTime,1); assert.equal(received.at(-1).revision,20);
  });
});
