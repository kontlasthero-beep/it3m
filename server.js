const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAP_IDS = ['classic', 'ice', 'moving-walls', 'items'];
const rooms = new Map();
const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024, perMessageDeflate: false });
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.wav': 'audio/wav'
};

function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 4_000_000) reject(new Error('Request body too large'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}

function createRoomCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(6), byte => ROOM_CODE_CHARS[byte % ROOM_CODE_CHARS.length]).join('');
  } while (rooms.has(code));
  return code;
}

function createPasswordHash(password) {
  if (!password) return null;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function verifyRoomPassword(room, password) {
  if (!room.passwordHash) return true;
  if (typeof password !== 'string') return false;
  const supplied = crypto.scryptSync(password, Buffer.from(room.passwordHash.salt, 'hex'), 32);
  return crypto.timingSafeEqual(supplied, Buffer.from(room.passwordHash.hash, 'hex'));
}

function recordForfeit(room, disconnectedRole) {
  if (room.status !== 'playing' || room.forfeitWinner != null) return;
  room.forfeitWinner = disconnectedRole === 'host' ? 1 : 0;
  room.status = 'complete';
  sendToRoomRole(room, disconnectedRole === 'host' ? 'challenger' : 'host', {
    type: 'forfeit', winner: room.forfeitWinner, disconnectedRole
  });
  broadcastRoom(room);
}

function playerForToken(room, token) {
  if (room.host.token === token) return { player: room.host, role: 'host', index: 0 };
  if (room.challenger?.token === token) return { player: room.challenger, role: 'challenger', index: 1 };
  return null;
}

function roomView(room) {
  return {
    code: room.code,
    status: room.status,
    host: { name: room.host.name, mapId: room.host.mapId },
    challenger: room.challenger ? { name: room.challenger.name, mapId: room.challenger.mapId } : null,
    seriesMaps: room.seriesMaps,
    snapshotRevision: room.snapshotRevision,
    forfeitWinner: room.forfeitWinner ?? null
  };
}

function fail(response, status, message) {
  sendJson(response, status, { error: message });
}

function sendSocketJson(socket, message) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  if (socket.bufferedAmount > 512 * 1024 && message.type === 'snapshot') return false;
  socket.send(JSON.stringify(message));
  return true;
}

function sendToRoomRole(room, role, message) {
  return sendSocketJson(room.sockets.get(role), message);
}

async function getTurnIceServers(room, role) {
  const cached = room.turnCredentials.get(role);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.iceServers;

  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !apiToken) throw new Error('TURN is not configured');

  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ttl: 86_400 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data.iceServers)) {
    console.warn(`Cloudflare TURN credential request failed: ${response.status}`);
    throw new Error('TURN credentials could not be generated');
  }

  room.turnCredentials.set(role, { iceServers: data.iceServers, expiresAt: Date.now() + 86_400_000 });
  return data.iceServers;
}

function broadcastRoom(room) {
  const message = { type: 'room', room: roomView(room) };
  for (const socket of room.sockets.values()) sendSocketJson(socket, message);
}

function dispatchPendingActions(room) {
  const hostSocket = room.sockets.get('host');
  if (hostSocket?.readyState !== WebSocket.OPEN) return;
  for (const pending of room.pendingActions.values()) {
    if (pending.delivered) continue;
    pending.delivered = sendSocketJson(hostSocket, { type: 'action', packet: pending.packet });
  }
}

function receiveRoomSocketMessage(room, member, socket, raw) {
  let message;
  try { message = JSON.parse(raw.toString()); }
  catch {
    socket.close(1007, 'Invalid JSON');
    return;
  }
  room.updatedAt = Date.now();

  if (message.type === 'snapshot' && member.role === 'host' && ['playing', 'complete'].includes(room.status) && message.snapshot && typeof message.snapshot === 'object') {
    if (Number.isSafeInteger(message.revision) && message.revision <= room.snapshotRevision) return;
    room.snapshot = message.snapshot;
    room.snapshotRevision = Number.isSafeInteger(message.revision) ? message.revision : room.snapshotRevision + 1;
    sendToRoomRole(room, 'challenger', { type: 'snapshot', revision: room.snapshotRevision, snapshot: room.snapshot });
    return;
  }

  if (message.type === 'action' && member.role === 'challenger' && room.status === 'playing' &&
      typeof message.actionId === 'string' && message.actionId.length <= 80 && message.action && typeof message.action.type === 'string') {
    if (room.processedActionIds.has(message.actionId)) {
      sendSocketJson(socket, { type: 'action-ack', id: message.actionId });
      return;
    }
    if (room.pendingActions.has(message.actionId)) return;
    if (room.pendingActions.size >= 100) {
      sendSocketJson(socket, { type: 'error', message: '행동 전송 대기열이 가득 찼습니다.' });
      return;
    }
    const packet = { id: message.actionId, playerIndex: member.index, action: message.action };
    room.pendingActions.set(message.actionId, { packet, delivered: false });
    dispatchPendingActions(room);
    return;
  }

  if (message.type === 'action-ack' && member.role === 'host' && typeof message.id === 'string') {
    if (room.pendingActions.delete(message.id)) {
      room.processedActionIds.add(message.id);
      if (room.processedActionIds.size > 512) room.processedActionIds.delete(room.processedActionIds.values().next().value);
      sendToRoomRole(room, 'challenger', { type: 'action-ack', id: message.id });
    }
    return;
  }

  if (message.type === 'rtc-signal' && room.status === 'playing' && room.challenger) {
    const signal = message.signal;
    if (!signal || !['offer', 'answer', 'candidate'].includes(signal.type)) return;
    if (signal.type === 'candidate') {
      if (signal.candidate != null && (typeof signal.candidate !== 'string' || signal.candidate.length > 4096)) return;
      if (signal.sdpMid != null && (typeof signal.sdpMid !== 'string' || signal.sdpMid.length > 128)) return;
      if (signal.sdpMLineIndex != null && !Number.isInteger(signal.sdpMLineIndex)) return;
    } else if (typeof signal.sdp !== 'string' || signal.sdp.length > 128_000) return;
    sendToRoomRole(room, member.role === 'host' ? 'challenger' : 'host', {
      type: 'rtc-signal', from: member.role, signal
    });
  }
}

function attachRoomSocket(socket, room, member) {
  const previous = room.sockets.get(member.role);
  if (previous && previous !== socket && previous.readyState === WebSocket.OPEN) previous.close(4001, 'Reconnected');
  room.sockets.set(member.role, socket);
  room.updatedAt = Date.now();
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', data => receiveRoomSocketMessage(room, member, socket, data));
  socket.on('close', () => {
    if (room.sockets.get(member.role) !== socket) return;
    room.sockets.delete(member.role);
    if (member.role === 'host') {
      for (const pending of room.pendingActions.values()) pending.delivered = false;
    }
    recordForfeit(room, member.role);
    sendToRoomRole(room, member.role === 'host' ? 'challenger' : 'host', { type: 'peer-connection', role: member.role, connected: false });
  });
  socket.on('error', error => console.warn(`WebSocket ${room.code} ${member.role}: ${error.message}`));

  sendSocketJson(socket, {
    type: 'welcome',
    role: member.role,
    room: roomView(room),
    snapshotRevision: room.snapshotRevision,
    snapshot: member.role === 'challenger' ? room.snapshot : null
  });
  sendToRoomRole(room, member.role === 'host' ? 'challenger' : 'host', { type: 'peer-connection', role: member.role, connected: true });
  if (member.role === 'host') dispatchPendingActions(room);
}

function rejectUpgrade(socket, status, message) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'GET' && url.pathname === '/api/rooms') {
    const publicRooms = [...rooms.values()]
      .filter(room => room.isPublic && room.status === 'waiting' && !room.challenger)
      .map(room => ({ code: room.code, name: room.host.name, locked: Boolean(room.passwordHash), createdAt: room.createdAt }));
    return sendJson(response, 200, { rooms: publicRooms });
  }
  if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true });

  if (request.method === 'POST' && url.pathname === '/api/rooms') {
    const data = await readJson(request);
    const password = typeof data.password === 'string' ? data.password : '';
    if (password.length > 64) return fail(response, 400, '비밀번호는 64자 이하여야 합니다.');
    const code = createRoomCode();
    const token = crypto.randomBytes(24).toString('base64url');
    const room = {
      code,
      host: { name: String(data.name || '방장').trim().slice(0, 20) || '방장', token, mapId: null },
      isPublic: data.isPublic === true,
      passwordHash: createPasswordHash(password),
      createdAt: Date.now(),
      challenger: null,
      status: 'waiting',
      seriesMaps: null,
      actions: [],
      sockets: new Map(),
      pendingActions: new Map(),
      processedActionIds: new Set(),
      turnCredentials: new Map(),
      snapshot: null,
      snapshotRevision: 0,
      forfeitWinner: null,
      updatedAt: Date.now()
    };
    rooms.set(code, room);
    return sendJson(response, 201, { code, token, role: 'host', room: roomView(room) });
  }

  if (parts[0] !== 'api' || parts[1] !== 'rooms' || !parts[2]) return fail(response, 404, 'Not found');
  const room = rooms.get(parts[2].toUpperCase());
  if (!room) return fail(response, 404, '방을 찾을 수 없습니다.');
  room.updatedAt = Date.now();

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'join') {
    if (room.status !== 'waiting' || room.challenger) return fail(response, 409, '이미 다른 도전자가 참가한 방입니다.');
    const data = await readJson(request);
    if (!verifyRoomPassword(room, data.password)) return fail(response, 403, '방 비밀번호가 올바르지 않습니다.');
    const token = crypto.randomBytes(24).toString('base64url');
    room.challenger = { name: String(data.name || '도전자').trim().slice(0, 20) || '도전자', token, mapId: null };
    room.status = 'choosing';
    broadcastRoom(room);
    return sendJson(response, 200, { code: room.code, token, role: 'challenger', room: roomView(room) });
  }

  const data = await readJson(request);
  const member = playerForToken(room, data.token);
  if (!member) return fail(response, 403, '방 참가 권한이 없습니다.');

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'turn-credentials') {
    if (room.status !== 'playing') return fail(response, 409, 'TURN 자격 증명은 대전 중에만 발급할 수 있습니다.');
    try {
      const iceServers = await getTurnIceServers(room, member.role);
      return sendJson(response, 200, { iceServers });
    } catch (error) {
      const status = error.message === 'TURN is not configured' ? 503 : 502;
      return fail(response, status, error.message);
    }
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'map') {
    if (['playing', 'complete'].includes(room.status)) return fail(response, 409, '맵을 선택할 수 없는 상태입니다.');
    if (!MAP_IDS.includes(data.mapId)) return fail(response, 400, '올바르지 않은 맵입니다.');
    member.player.mapId = data.mapId;
    if (room.challenger && room.host.mapId && room.challenger.mapId) {
      const randomMap = MAP_IDS[crypto.randomInt(MAP_IDS.length)];
      room.seriesMaps = [room.host.mapId, room.challenger.mapId, randomMap];
      room.status = 'ready';
    } else if (room.challenger) room.status = 'choosing';
    broadcastRoom(room);
    return sendJson(response, 200, { room: roomView(room) });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'start') {
    if (member.role !== 'host') return fail(response, 403, '방장만 대전을 시작할 수 있습니다.');
    if (room.status !== 'ready' || !room.seriesMaps) return fail(response, 409, '두 플레이어가 맵을 선택해야 합니다.');
    room.status = 'playing';
    room.snapshot = null;
    room.snapshotRevision = 0;
    room.pendingActions.clear();
    room.processedActionIds.clear();
    broadcastRoom(room);
    return sendJson(response, 200, { room: roomView(room) });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'complete') {
    if (member.role !== 'host') return fail(response, 403, '방장만 대전을 종료할 수 있습니다.');
    room.status = 'complete';
    broadcastRoom(room);
    return sendJson(response, 200, { room: roomView(room) });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'action') {
    if (member.role !== 'challenger' || room.status !== 'playing') return fail(response, 409, '현재 행동을 전달할 수 없습니다.');
    if (!data.action || typeof data.action.type !== 'string') return fail(response, 400, '올바르지 않은 행동입니다.');
    if (room.actions.length >= 100) room.actions.shift();
    room.actions.push({ id: crypto.randomUUID(), playerIndex: member.index, action: data.action });
    return sendJson(response, 202, { accepted: true });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'poll') {
    if (['playing', 'complete'].includes(room.status) && member.role === 'host' && data.snapshot) {
      room.snapshot = data.snapshot;
      room.snapshotRevision += 1;
    }
    const actions = member.role === 'host' ? room.actions.splice(0) : [];
    return sendJson(response, 200, {
      room: roomView(room),
      snapshotRevision: room.snapshotRevision,
      snapshot: member.role === 'challenger' ? room.snapshot : null,
      actions
    });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'leave') {
    if (member.role === 'host') {
      recordForfeit(room, member.role);
      sendToRoomRole(room, 'challenger', { type: 'room-closed', message: '방장이 방을 종료했습니다.' });
      for (const socket of room.sockets.values()) socket.close(1000, 'Room closed');
      rooms.delete(room.code);
    }
    else {
      if (room.status === 'playing') {
        recordForfeit(room, member.role);
        return sendJson(response, 200, { ok: true });
      }
      room.challenger = null;
      room.status = room.host.mapId ? 'choosing' : 'waiting';
      room.seriesMaps = null;
      room.actions = [];
      room.pendingActions.clear();
      room.processedActionIds.clear();
      broadcastRoom(room);
    }
    return sendJson(response, 200, { ok: true });
  }

  return fail(response, 404, 'Not found');
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(request, response, url);
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(response, 405, 'Method not allowed');
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return fail(response, 400, 'Invalid path'); }
    if (pathname === '/') pathname = '/index.html';
    const file = path.resolve(ROOT, `.${pathname}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) return fail(response, 403, 'Forbidden');
    const stat = await fs.promises.stat(file).catch(() => null);
    if (!stat?.isFile()) return fail(response, 404, 'Not found');
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': path.basename(file) === 'index.html' ? 'no-cache' : 'public, max-age=3600'
    });
    if (request.method === 'HEAD') return response.end();
    fs.createReadStream(file).pipe(response);
  } catch (error) {
    if (error.message === 'Invalid JSON') return fail(response, 400, error.message);
    console.error(error);
    if (!response.headersSent) fail(response, 500, 'Internal server error');
  }
});

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname !== '/api/socket') return rejectUpgrade(socket, 404, 'Not Found');
  const room = rooms.get((url.searchParams.get('code') || '').toUpperCase());
  if (!room) return rejectUpgrade(socket, 404, 'Room Not Found');
  const member = playerForToken(room, url.searchParams.get('token'));
  if (!member) return rejectUpgrade(socket, 403, 'Forbidden');
  webSocketServer.handleUpgrade(request, socket, head, client => attachRoomSocket(client, room, member));
});

const heartbeatTimer = setInterval(() => {
  for (const socket of webSocketServer.clients) {
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    socket.ping();
  }
}, 5_000);
heartbeatTimer.unref();

setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (room.updatedAt < cutoff) rooms.delete(code);
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Underhanded Curling Club listening on port ${PORT}`));

process.once('SIGTERM', () => {
  for (const socket of webSocketServer.clients) {
    sendSocketJson(socket, { type: 'server-restarting' });
    socket.close(1012, 'Service restart');
  }
  const forceExitTimer = setTimeout(() => process.exit(0), 25_000);
  forceExitTimer.unref();
  server.close(() => process.exit(0));
});
