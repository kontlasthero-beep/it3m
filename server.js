const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 4173;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAP_IDS = ['classic', 'ice', 'moving-walls', 'items'];
const rooms = new Map();
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
    snapshotRevision: room.snapshotRevision
  };
}

function fail(response, status, message) {
  sendJson(response, status, { error: message });
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  if (request.method === 'GET' && url.pathname === '/api/health') return sendJson(response, 200, { ok: true });

  if (request.method === 'POST' && url.pathname === '/api/rooms') {
    const data = await readJson(request);
    const code = createRoomCode();
    const token = crypto.randomBytes(24).toString('base64url');
    const room = {
      code,
      host: { name: String(data.name || '방장').trim().slice(0, 20) || '방장', token, mapId: null },
      challenger: null,
      status: 'waiting',
      seriesMaps: null,
      actions: [],
      snapshot: null,
      snapshotRevision: 0,
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
    const token = crypto.randomBytes(24).toString('base64url');
    room.challenger = { name: String(data.name || '도전자').trim().slice(0, 20) || '도전자', token, mapId: null };
    room.status = 'choosing';
    return sendJson(response, 200, { code: room.code, token, role: 'challenger', room: roomView(room) });
  }

  const data = await readJson(request);
  const member = playerForToken(room, data.token);
  if (!member) return fail(response, 403, '방 참가 권한이 없습니다.');

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'map') {
    if (['playing', 'complete'].includes(room.status)) return fail(response, 409, '맵을 선택할 수 없는 상태입니다.');
    if (!MAP_IDS.includes(data.mapId)) return fail(response, 400, '올바르지 않은 맵입니다.');
    member.player.mapId = data.mapId;
    if (room.challenger && room.host.mapId && room.challenger.mapId) {
      const randomMap = MAP_IDS[crypto.randomInt(MAP_IDS.length)];
      room.seriesMaps = [room.host.mapId, room.challenger.mapId, randomMap];
      room.status = 'ready';
    } else if (room.challenger) room.status = 'choosing';
    return sendJson(response, 200, { room: roomView(room) });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'start') {
    if (member.role !== 'host') return fail(response, 403, '방장만 대전을 시작할 수 있습니다.');
    if (room.status !== 'ready' || !room.seriesMaps) return fail(response, 409, '두 플레이어가 맵을 선택해야 합니다.');
    room.status = 'playing';
    room.snapshot = null;
    room.snapshotRevision = 0;
    return sendJson(response, 200, { room: roomView(room) });
  }

  if (request.method === 'POST' && parts.length === 4 && parts[3] === 'complete') {
    if (member.role !== 'host') return fail(response, 403, '방장만 대전을 종료할 수 있습니다.');
    room.status = 'complete';
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
    if (member.role === 'host') rooms.delete(room.code);
    else {
      room.challenger = null;
      room.status = room.host.mapId ? 'choosing' : 'waiting';
      room.seriesMaps = null;
      room.actions = [];
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

setInterval(() => {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  for (const [code, room] of rooms) if (room.updatedAt < cutoff) rooms.delete(code);
}, 10 * 60 * 1000).unref();

server.listen(PORT, '0.0.0.0', () => console.log(`Underhanded Curling Club listening on port ${PORT}`));
