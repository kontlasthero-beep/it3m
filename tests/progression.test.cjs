const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const { WebSocket } = require('ws');
const { createProfileStore, fameAtLevel, matchOutcome } = require('../progression');
const { DEFAULT_DECK, validateDeck, deckForPreset } = require('../deck-config');

test('eight-card bags allow one duplicate and respect unlock levels', async () => {
  const doubleHardening = ['hardening', 'hardening', 'guard', 'pulse', 'reposition', 'brick', 'blackhole', 'ammo'];
  assert.equal(validateDeck(DEFAULT_DECK, 1), true);
  assert.equal(validateDeck(doubleHardening, 1), true);
  assert.equal(validateDeck(['hardening', 'hardening', 'guard', 'guard', 'pulse', 'brick', 'ammo', 'bluffing'], 1), false);
  assert.equal(validateDeck([...DEFAULT_DECK.slice(0, 7), 'escape'], 1), false);
  assert.equal(validateDeck([...DEFAULT_DECK.slice(0, 7), 'escape'], 2), true);
  assert.equal(validateDeck([...DEFAULT_DECK.slice(0, 7), 'data-barrier'], 1), false);
  assert.equal(validateDeck([...DEFAULT_DECK.slice(0, 7), 'data-barrier'], 2), true);
  assert.equal(validateDeck(DEFAULT_DECK.slice(0, 7), 2), false);
  assert.deepEqual(deckForPreset([null, null, null], 0, 1), DEFAULT_DECK);
  const store = createProfileStore('');
  const account = await store.register('deck_owner', 'long-password', 'DECK');
  await assert.rejects(store.saveDecks(account.token, [[...DEFAULT_DECK.slice(0, 7), 'escape'], null, null], 0), /가방은/);
  const saved = await store.saveDecks(account.token, [null, doubleHardening, null], 1);
  assert.deepEqual(saved.decks[1], doubleHardening);
  assert.equal(saved.activePreset, 1);
  assert.deepEqual((await store.login('deck_owner', 'long-password')).profile.decks[1], doubleHardening);
});

test('local level 100 is a view-only override for memory profiles and deck validation', async () => {
  const local = createProfileStore('', { localTestLevel: 100 });
  const guest = await local.createGuest('테스터');
  assert.equal(guest.profile.level, 100);
  assert.equal(guest.profile.levelStart, fameAtLevel(100));
  assert.equal(guest.profile.fame, fameAtLevel(100));
  const account = await local.register('local_level100', 'long-password', '테스터');
  assert.equal(account.profile.level, 100);
  const deck = [...DEFAULT_DECK.slice(0, 7), 'data-barrier'];
  const saved = await local.saveDecks(account.token, [deck, null, null], 0);
  assert.equal(saved.level, 100);
  assert.deepEqual(saved.decks[0], deck);
  const ordinary = createProfileStore('');
  assert.equal((await ordinary.createGuest('일반')).profile.level, 1);
});

test('level thresholds and duplicate awards', async () => {
  const store = createProfileStore('');
  const player = await store.register('player_one', 'long-password-1', 'PLAYER');
  await assert.rejects(store.register('PLAYER_ONE', 'long-password-2', 'OTHER'), /이미 사용 중/);
  assert.equal((await store.login('player_one', 'wrong-password')), null);
  assert.equal((await store.login('PLAYER_ONE', 'long-password-1')).profile.name, 'PLAYER');
  const identity = await store.findByToken(player.token);
  const other = await store.register('player_two', 'long-password-2', 'OTHER');
  const opponent = await store.findByToken(other.token);
  const ids = [identity.internalId, opponent.internalId];
  const firstId = '33fe4487-a804-47af-a6a4-f9e6c4ef5b13';
  assert.equal((await store.awardMatch(firstId, ids, 0))[0].profile.fame, 100);
  assert.equal((await store.awardMatch(firstId, ids, 0))[0].profile.fame, 100);
  const second = await store.awardMatch('379546a5-7e38-4290-b770-581724fc2f28', ids, 0);
  assert.equal(second[0].profile.fame, 200);
  assert.equal(second[0].profile.level, 2);
  assert.equal(second[0].previousLevel, 2);
  assert.equal(second[0].profile.wins, 2);
  assert.equal(second[0].profile.played, 2);
  assert.equal(second[1].profile.fame, 100);
  assert.equal(second[1].profile.losses, 2);
  assert.deepEqual([1, 2, 3, 4, 5].map(fameAtLevel), [0, 100, 225, 380, 570]);
  await store.logout(player.token);
  assert.equal(await store.findByToken(player.token), null);
  assert.equal(matchOutcome([{ winner: 0, scores: [80, 20] }, { winner: 0, scores: [70, 10] }]).winner, 0);
  assert.equal(matchOutcome([{ winner: 0, scores: [20, 80] }, { winner: 0, scores: [70, 10] }]), null);
});

test('AI wins award level-based fame once, only to the registered match owner', async () => {
  let now = 100_000;
  const store = createProfileStore('', { now: () => now });
  const account = await store.register('ai_player', 'long-password', 'PLAYER');
  const other = await store.register('ai_other', 'long-password', 'OTHER');
  const guest = await store.createGuest('GUEST');
  assert.equal(await store.startAiMatch(guest.token, 'easy'), null);
  await assert.rejects(store.startAiMatch(account.token, 'impossible'), /난이도/);
  for (const [difficulty, gained] of [['easy', 25], ['normal', 35], ['hard', 75]]) {
    const matchId = await store.startAiMatch(account.token, difficulty);
    await assert.rejects(store.awardAiMatch(other.token, matchId, [80, 20]), /찾을 수 없습니다/);
    await assert.rejects(store.awardAiMatch(account.token, matchId, [20, 80]), /승리 결과/);
    await assert.rejects(store.awardAiMatch(account.token, matchId, [80, 20]), /아직 완료되지/);
    now += 20_000;
    const award = await store.awardAiMatch(account.token, matchId, [80, 20]);
    assert.equal(award.gained, gained);
    assert.equal((await store.awardAiMatch(account.token, matchId, [80, 20])).profile.fame, award.profile.fame);
  }
  const profile = (await store.findByToken(account.token)).profile;
  assert.equal(profile.fame, 135);
  assert.equal(profile.level, 2);
  assert.equal(profile.played, 0);
});

test('forfeited AI matches cannot later award fame', async () => {
  let now = 100_000;
  const store = createProfileStore('', { now: () => now });
  const player = await store.register('ai_forfeit', 'long-password', 'PLAYER');
  const other = await store.register('ai_forfeit_other', 'long-password', 'OTHER');
  const matchId = await store.startAiMatch(player.token, 'hard');
  await assert.rejects(store.forfeitAiMatch(other.token, matchId), /찾을 수 없습니다/);
  assert.equal(await store.forfeitAiMatch(player.token, matchId), true);
  assert.equal(await store.forfeitAiMatch(player.token, matchId), true);
  now += 20_000;
  await assert.rejects(store.awardAiMatch(player.token, matchId, [80, 20]), /포기/);
  assert.equal((await store.findByToken(player.token)).profile.fame, 0);
});

test('accounts and online match fame are bound to room participants', { timeout: 20000 }, async t => {
  const reservation = net.createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(port), DATABASE_URL: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode != null) return;
    const closed = once(child, 'exit');
    child.kill();
    await closed;
  });
  await new Promise((resolve, reject) => {
    child.stdout.on('data', chunk => { if (String(chunk).includes('listening')) resolve(); });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited ${code}`)));
  });

  async function api(route, body, token, method = 'POST') {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json() };
  }
  const hostProfile = (await api('/api/accounts/register', { username: 'host_account', password: 'host-password', name: 'HOST' })).data;
  const challengerProfile = (await api('/api/accounts/register', { username: 'challenger_account', password: 'challenger-password', name: 'CHALLENGER' })).data;
  assert.equal((await api('/api/ai-matches', { difficulty: 'easy' })).status, 401);
  assert.equal((await api('/api/ai-matches', { difficulty: 'unknown' }, hostProfile.token)).status, 400);
  const aiMatch = await api('/api/ai-matches', { difficulty: 'normal' }, hostProfile.token);
  assert.equal(aiMatch.status, 201);
  assert.match(aiMatch.data.matchId, /^[0-9a-f-]{36}$/);
  assert.equal((await api(`/api/ai-matches/${aiMatch.data.matchId}/complete`,
    { scores: [100, 20] }, challengerProfile.token)).status, 409);
  assert.equal((await api(`/api/ai-matches/${aiMatch.data.matchId}/complete`,
    { scores: [100, 20] }, hostProfile.token)).status, 409);
  const abandoned = (await api('/api/ai-matches', { difficulty: 'hard' }, hostProfile.token)).data.matchId;
  assert.equal((await api(`/api/ai-matches/${abandoned}/forfeit`, undefined, challengerProfile.token)).status, 409);
  assert.equal((await api(`/api/ai-matches/${abandoned}/forfeit`, undefined, hostProfile.token)).status, 200);
  assert.equal((await api(`/api/ai-matches/${abandoned}/complete`,
    { scores: [100, 20] }, hostProfile.token)).status, 409);
  assert.match(hostProfile.profile.id, /^UCC-[A-Z2-9]{8}$/);
  assert.equal(hostProfile.persistent, false);
  assert.equal((await api('/api/profile', undefined, null, 'GET')).status, 401);
  assert.equal((await api('/api/profile', { name: 'NEW HOST' }, hostProfile.token, 'PATCH')).data.profile.name, 'NEW HOST');
  const hostBag = ['hardening', 'hardening', 'guard', 'pulse', 'reposition', 'brick', 'blackhole', 'ammo'];
  const challengerBag = ['guard', 'guard', 'hardening', 'pulse', 'reposition', 'brick', 'blackhole', 'bluffing'];
  assert.equal((await api('/api/profile/decks', { decks: [hostBag, null, null], activePreset: 0 }, hostProfile.token, 'PUT')).status, 200);
  assert.equal((await api('/api/profile/decks', { decks: [challengerBag, null, null], activePreset: 0 }, challengerProfile.token, 'PUT')).status, 200);
  assert.equal((await api('/api/profile/decks', { decks: [[...hostBag.slice(0, 7), 'escape'], null, null], activePreset: 0 }, hostProfile.token, 'PUT')).status, 400);

  assert.equal((await api('/api/accounts/register', { username: 'HOST_ACCOUNT', password: 'another-password', name: 'DOUBLE' })).status, 400);
  assert.equal((await api('/api/rooms', { isPublic: true })).status, 401);
  const host = (await api('/api/rooms', { isPublic: true }, hostProfile.token)).data;
  assert.deepEqual(host.room.host.deck, hostBag);
  const roomPath = `/api/rooms/${host.code}`;
  assert.equal((await api(`${roomPath}/join`, {}, hostProfile.token)).status, 409);
  const challenger = (await api(`${roomPath}/join`, {}, challengerProfile.token)).data;
  assert.deepEqual(challenger.room.challenger.deck, challengerBag);
  assert.deepEqual(challenger.room.host.deck, hostBag);
  await api(`${roomPath}/map`, { token: host.token, mapId: 'classic' });
  await api(`${roomPath}/map`, { token: challenger.token, mapId: 'ice' });
  const started = await api(`${roomPath}/start`, { token: host.token });
  assert.equal(started.status, 200);
  assert.match(started.data.room.matchId, /^[0-9a-f-]{36}$/);

  const rounds = [{ winner: 0, scores: [120, 30] }, { winner: 0, scores: [90, 10] }];
  assert.equal((await api(`${roomPath}/complete`, { token: challenger.token, roundResults: rounds })).status, 403);
  assert.equal((await api(`${roomPath}/complete`, { token: host.token, roundResults: [{ winner: 0, scores: [1, 2] }] })).status, 400);
  const completed = await api(`${roomPath}/complete`, { token: host.token, roundResults: rounds });
  assert.equal(completed.status, 200);
  assert.equal(completed.data.award.gained, 100);
  assert.equal((await api(`${roomPath}/complete`, { token: host.token, roundResults: rounds })).data.award.profile.fame, 100);
  const hostStats = (await api('/api/profile', undefined, hostProfile.token, 'GET')).data.profile;
  assert.equal(hostStats.fame, 100);
  assert.equal(hostStats.wins, 1);
  assert.equal(hostStats.played, 1);
  const challengerStats = (await api('/api/profile', undefined, challengerProfile.token, 'GET')).data.profile;
  assert.equal(challengerStats.fame, 50);
  assert.equal(challengerStats.losses, 1);

  const socket = new WebSocket(`ws://127.0.0.1:${port}/api/socket?code=${host.code}&token=${challenger.token}`);
  t.after(() => socket.terminate());
  const replayedAward = new Promise((resolve, reject) => {
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.type === 'profile-award') resolve(message);
    });
    socket.on('error', reject);
  });
  await once(socket, 'open');
  assert.equal((await replayedAward).award.profile.fame, 50);
});
