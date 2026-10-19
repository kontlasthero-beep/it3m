const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { normalizeDecks, validateDeck } = require('./deck-config');
const scrypt = promisify(crypto.scrypt);

const PLAY_FAME = 50;
const WIN_FAME = 50;
const AI_WIN_FAME = Object.freeze({ easy: 25, normal: 35, hard: 75 });
const AI_MIN_MATCH_MS = 20_000;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function validateAiDifficulty(difficulty) {
  if (!Object.hasOwn(AI_WIN_FAME, difficulty)) throw new Error('올바른 AI 난이도를 선택하세요.');
  return difficulty;
}

function validateAiVictory(scores) {
  if (!Array.isArray(scores) || scores.length !== 2 ||
      scores.some(score => !Number.isInteger(score) || score < -1000 || score > 1000) ||
      scores[0] <= scores[1]) throw new Error('AI 대전 승리 결과가 필요합니다.');
}

function fameAtLevel(level) {
  let total = 0;
  let required = 100;
  for (let current = 1; current < level; current += 1) {
    total += required;
    required += 20 + current * 5;
  }
  return total;
}

function presentProfile(row) {
  let level = 1;
  while (row.fame >= fameAtLevel(level + 1)) level += 1;
  return {
    id: row.publicId,
    username: row.username || null,
    name: row.name,
    fame: row.fame,
    level,
    levelStart: fameAtLevel(level),
    nextLevel: fameAtLevel(level + 1),
    played: row.played || 0,
    wins: row.wins || 0,
    losses: row.losses || 0,
    draws: row.draws || 0,
    tutorialCompleted: row.tutorialCompleted === true,
    adventureUnlocked: row.tutorialCompleted === true,
    decks: normalizeDecks(row.decks, level, row.tutorialCompleted === true),
    activePreset: Number.isInteger(row.activePreset) && row.activePreset >= 0 && row.activePreset < 3 ? row.activePreset : 0
  };
}

function newPublicId() {
  const bytes = crypto.randomBytes(8);
  return `UCC-${Array.from(bytes, byte => ID_CHARS[byte % ID_CHARS.length]).join('')}`;
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newSession() {
  return crypto.randomBytes(32).toString('base64url');
}

function normalizeUsername(value) {
  const username = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_]{4,20}$/.test(username)) throw new Error('계정 ID는 영문 소문자, 숫자, _를 사용해 4~20자로 입력하세요.');
  return username;
}

function validatePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value, 'utf8') > 128)
    throw new Error('비밀번호는 8자 이상, 128바이트 이하로 입력하세요.');
  return value;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 32);
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{64}$/.test(hash || '')) return false;
  const derived = await scrypt(password, Buffer.from(salt, 'hex'), 32);
  return crypto.timingSafeEqual(derived, Buffer.from(hash, 'hex'));
}

function parseBearer(header) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header || '');
  return match?.[1] || null;
}

function normalizeName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 20) throw new Error('닉네임은 1~20자로 입력하세요.');
  return name;
}

function matchOutcome(rounds) {
  if (!Array.isArray(rounds) || rounds.length < 2 || rounds.length > 3) return null;
  const wins = [0, 0];
  const totals = [0, 0];
  for (const round of rounds) {
    if (!Array.isArray(round?.scores) || round.scores.length !== 2 ||
        round.scores.some(score => !Number.isInteger(score) || score < -1000 || score > 1000)) return null;
    const [a, b] = round.scores;
    const winner = a === b ? null : a > b ? 0 : 1;
    if (round.winner !== winner) return null;
    if (winner !== null) wins[winner] += 1;
    totals[0] += a;
    totals[1] += b;
  }
  if (rounds.length === 2 && wins[0] < 2 && wins[1] < 2) return null;
  if (rounds.length === 3 && (wins[0] >= 2 || wins[1] >= 2) &&
      (rounds[0].winner === rounds[1].winner) && rounds[0].winner !== null) return null;
  const winner = wins[0] >= 2 ? 0 : wins[1] >= 2 ? 1 :
    wins[0] !== wins[1] ? (wins[0] > wins[1] ? 0 : 1) :
    totals[0] === totals[1] ? null : totals[0] > totals[1] ? 0 : 1;
  return { winner, wins, totals };
}

function createMemoryStore(now = Date.now, localTestLevel = null) {
  const profiles = new Map();
  const usernames = new Map();
  const tokens = new Map();
  const awards = new Map();
  const aiMatches = new Map();
  const pending = new Set();
  const lookup = token => profiles.get(tokens.get(tokenHash(token)));
  const profileView = row => {
    if (localTestLevel == null) return presentProfile(row);
    const levelStart = fameAtLevel(localTestLevel);
    const nextLevel = fameAtLevel(localTestLevel + 1);
    const fame = levelStart + row.fame % (nextLevel - levelStart);
    return presentProfile({ ...row, fame });
  };
  return {
    persistent: false,
    async createGuest(name) {
      const token = newSession();
      const row = { id: crypto.randomUUID(), publicId: newPublicId(), name: normalizeName(name || '게스트'), fame: 0,
        played: 0, wins: 0, losses: 0, draws: 0 };
      profiles.set(row.id, row);
      tokens.set(tokenHash(token), row.id);
      return { token, profile: profileView(row) };
    },
    async register(usernameInput, passwordInput, nameInput) {
      const username = normalizeUsername(usernameInput);
      const password = validatePassword(passwordInput);
      const name = normalizeName(nameInput);
      if (usernames.has(username) || pending.has(username)) throw new Error('이미 사용 중인 계정 ID입니다.');
      pending.add(username);
      try {
        const passwordHash = await hashPassword(password);
        const token = newSession();
        const row = { id: crypto.randomUUID(), publicId: newPublicId(), username, passwordHash, name, fame: 0,
          played: 0, wins: 0, losses: 0, draws: 0 };
        profiles.set(row.id, row);
        usernames.set(username, row.id);
        tokens.set(tokenHash(token), row.id);
        return { token, profile: profileView(row) };
      } finally { pending.delete(username); }
    },
    async login(usernameInput, passwordInput) {
      const row = profiles.get(usernames.get(normalizeUsername(usernameInput)));
      if (!row || !(await verifyPassword(String(passwordInput || ''), row.passwordHash))) return null;
      const token = newSession();
      tokens.set(tokenHash(token), row.id);
      return { token, profile: profileView(row) };
    },
    async findByToken(token) {
      const row = lookup(token);
      return row ? { internalId: row.id, profile: profileView(row) } : null;
    },
    async rename(token, name) {
      const row = lookup(token);
      if (!row) return null;
      row.name = normalizeName(name);
      return profileView(row);
    },
    async completeTutorial(token) {
      const row = lookup(token);
      if (!row) return null;
      row.tutorialCompleted = true;
      return profileView(row);
    },
    async saveDecks(token, decks, activePreset) {
      const row = lookup(token);
      if (!row?.username) return null;
      const level = profileView(row).level;
      if (!Array.isArray(decks) || decks.length !== 3 ||
          decks.some(deck => deck !== null && !validateDeck(deck, level, row.tutorialCompleted === true)) ||
          !Number.isInteger(activePreset) || activePreset < 0 || activePreset > 2)
        throw new Error('가방은 8장으로 구성하고, 한 종류만 두 장 넣을 수 있습니다.');
      row.decks = decks.map(deck => deck ? [...deck] : null);
      row.activePreset = activePreset;
      return profileView(row);
    },
    async logout(token) { tokens.delete(tokenHash(token)); },
    async startAiMatch(token, difficulty) {
      const row = lookup(token);
      if (!row?.username) return null;
      const matchId = crypto.randomUUID();
      aiMatches.set(matchId, { profileId: row.id, difficulty: validateAiDifficulty(difficulty), startedAt: now() });
      return matchId;
    },
    async awardAiMatch(token, matchId, scores) {
      const row = lookup(token);
      if (!row?.username) return null;
      const match = aiMatches.get(matchId);
      if (!match || match.profileId !== row.id) throw new Error('AI 경기 기록을 찾을 수 없습니다.');
      if (match.forfeited) throw new Error('AI 경기는 포기되었습니다.');
      if (match.award) return { ...match.award, profile: profileView(row) };
      validateAiVictory(scores);
      if (now() - match.startedAt < AI_MIN_MATCH_MS) throw new Error('AI 경기가 아직 완료되지 않았습니다.');
      match.award = { gained: AI_WIN_FAME[match.difficulty], previousLevel: profileView(row).level };
      row.fame += match.award.gained;
      return { ...match.award, profile: profileView(row) };
    },
    async forfeitAiMatch(token, matchId) {
      const row = lookup(token);
      if (!row?.username) return null;
      const match = aiMatches.get(matchId);
      if (!match || match.profileId !== row.id) throw new Error('AI 경기 기록을 찾을 수 없습니다.');
      if (match.award) throw new Error('AI 경기가 이미 완료되었습니다.');
      match.forfeited = true;
      return true;
    },
    async awardMatch(matchId, playerIds, winner) {
      return playerIds.map((id, index) => {
        const row = profiles.get(id);
        if (!row) return null;
        const key = `${matchId}:${id}`;
        let record = awards.get(key);
        if (!record) {
          const gained = PLAY_FAME + (winner === index ? WIN_FAME : 0);
          record = { gained, previousLevel: profileView(row).level };
          awards.set(key, record);
          row.fame += gained;
          row.played += 1;
          if (winner === null) row.draws += 1;
          else if (winner === index) row.wins += 1;
          else row.losses += 1;
        }
        return { gained: record.gained, previousLevel: record.previousLevel, profile: profileView(row) };
      });
    }
  };
}

function createPostgresStore(connectionString) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  let ready;
  async function ensureReady() {
    if (!ready) ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS ucc_profiles (
        id UUID PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, token_hash TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL, fame INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`ALTER TABLE ucc_profiles
        ADD COLUMN IF NOT EXISTS username TEXT,
        ADD COLUMN IF NOT EXISTS password_hash TEXT,
        ADD COLUMN IF NOT EXISTS played INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS wins INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS losses INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS decks JSONB NOT NULL DEFAULT '[null,null,null]'::jsonb,
        ADD COLUMN IF NOT EXISTS active_preset INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tutorial_completed BOOLEAN NOT NULL DEFAULT FALSE`);
      await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS ucc_profiles_username_unique ON ucc_profiles (username)');
      await pool.query(`CREATE TABLE IF NOT EXISTS ucc_sessions (
        token_hash TEXT PRIMARY KEY, profile_id UUID NOT NULL REFERENCES ucc_profiles(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ucc_match_awards (
        match_id UUID NOT NULL, profile_id UUID NOT NULL REFERENCES ucc_profiles(id),
        gained INTEGER NOT NULL, fame_before INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (match_id, profile_id)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ucc_ai_matches (
        id UUID PRIMARY KEY, profile_id UUID NOT NULL REFERENCES ucc_profiles(id),
        difficulty TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ, gained INTEGER, fame_before INTEGER
      )`);
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  function fromRow(row) {
    return { id: row.id, publicId: row.public_id, username: row.username, name: row.name, fame: row.fame,
      played: row.played, wins: row.wins, losses: row.losses, draws: row.draws,
      decks: row.decks, activePreset: row.active_preset, tutorialCompleted: row.tutorial_completed };
  }
  async function insertSession(client, id) {
    const token = newSession();
    await client.query(`INSERT INTO ucc_sessions (token_hash, profile_id, expires_at)
      VALUES ($1, $2, NOW() + INTERVAL '30 days')`, [tokenHash(token), id]);
    return token;
  }
  return {
    persistent: true,
    async createGuest(name) {
      await ensureReady();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = newSession();
        try {
          const { rows } = await pool.query(
            'INSERT INTO ucc_profiles (id, public_id, token_hash, name) VALUES ($1, $2, $3, $4) RETURNING *',
            [crypto.randomUUID(), newPublicId(), tokenHash(token), normalizeName(name || '게스트')]
          );
          return { token, profile: presentProfile(fromRow(rows[0])) };
        } catch (error) {
          if (error.code !== '23505' || attempt === 2) throw error;
        }
      }
    },
    async register(usernameInput, passwordInput, nameInput) {
      const username = normalizeUsername(usernameInput);
      const passwordHash = await hashPassword(validatePassword(passwordInput));
      const name = normalizeName(nameInput);
      await ensureReady();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query(
            `INSERT INTO ucc_profiles (id, public_id, token_hash, username, password_hash, name)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [crypto.randomUUID(), newPublicId(), tokenHash(newSession()), username, passwordHash, name]
          );
          const token = await insertSession(client, rows[0].id);
          await client.query('COMMIT');
          return { token, profile: presentProfile(fromRow(rows[0])) };
        } catch (error) {
          await client.query('ROLLBACK');
          if (error.code === '23505' && String(error.constraint || '').includes('username')) throw new Error('이미 사용 중인 계정 ID입니다.');
          if (error.code !== '23505' || attempt === 2) throw error;
        } finally { client.release(); }
      }
    },
    async login(usernameInput, passwordInput) {
      const username = normalizeUsername(usernameInput);
      await ensureReady();
      const { rows } = await pool.query('SELECT * FROM ucc_profiles WHERE username = $1', [username]);
      if (!rows[0] || !(await verifyPassword(String(passwordInput || ''), rows[0].password_hash))) return null;
      const token = await insertSession(pool, rows[0].id);
      return { token, profile: presentProfile(fromRow(rows[0])) };
    },
    async findByToken(token) {
      await ensureReady();
      const { rows } = await pool.query(`SELECT p.* FROM ucc_profiles p
        LEFT JOIN ucc_sessions s ON s.profile_id = p.id AND s.token_hash = $1 AND s.expires_at > NOW()
        WHERE s.token_hash IS NOT NULL OR (p.username IS NULL AND p.token_hash = $1) LIMIT 1`, [tokenHash(token)]);
      return rows[0] ? { internalId: rows[0].id, profile: presentProfile(fromRow(rows[0])) } : null;
    },
    async rename(token, name) {
      await ensureReady();
      const member = await this.findByToken(token);
      if (!member) return null;
      const { rows } = await pool.query('UPDATE ucc_profiles SET name = $1 WHERE id = $2 RETURNING *',
        [normalizeName(name), member.internalId]);
      return rows[0] ? presentProfile(fromRow(rows[0])) : null;
    },
    async completeTutorial(token) {
      const member = await this.findByToken(token);
      if (!member) return null;
      const { rows } = await pool.query('UPDATE ucc_profiles SET tutorial_completed = TRUE WHERE id = $1 RETURNING *', [member.internalId]);
      return rows[0] ? presentProfile(fromRow(rows[0])) : null;
    },
    async saveDecks(token, decks, activePreset) {
      await ensureReady();
      const member = await this.findByToken(token);
      if (!member?.profile.username) return null;
      if (!Array.isArray(decks) || decks.length !== 3 ||
          decks.some(deck => deck !== null && !validateDeck(deck, member.profile.level, member.profile.tutorialCompleted)) ||
          !Number.isInteger(activePreset) || activePreset < 0 || activePreset > 2)
        throw new Error('가방은 8장으로 구성하고, 한 종류만 두 장 넣을 수 있습니다.');
      const { rows } = await pool.query(
        'UPDATE ucc_profiles SET decks = $1::jsonb, active_preset = $2 WHERE id = $3 RETURNING *',
        [JSON.stringify(decks), activePreset, member.internalId]
      );
      return rows[0] ? presentProfile(fromRow(rows[0])) : null;
    },
    async logout(token) {
      await ensureReady();
      await pool.query('DELETE FROM ucc_sessions WHERE token_hash = $1', [tokenHash(token)]);
    },
    async startAiMatch(token, difficulty) {
      validateAiDifficulty(difficulty);
      const member = await this.findByToken(token);
      if (!member?.profile.username) return null;
      const matchId = crypto.randomUUID();
      await pool.query('INSERT INTO ucc_ai_matches (id, profile_id, difficulty) VALUES ($1, $2, $3)',
        [matchId, member.internalId, difficulty]);
      return matchId;
    },
    async awardAiMatch(token, matchId, scores) {
      const member = await this.findByToken(token);
      if (!member?.profile.username) return null;
      await ensureReady();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: matches } = await client.query('SELECT * FROM ucc_ai_matches WHERE id = $1 FOR UPDATE', [matchId]);
        const match = matches[0];
        if (!match || match.profile_id !== member.internalId) throw new Error('AI 경기 기록을 찾을 수 없습니다.');
        if (match.completed_at && match.gained === 0) throw new Error('AI 경기는 포기되었습니다.');
        if (match.completed_at) {
          const { rows } = await client.query('SELECT * FROM ucc_profiles WHERE id = $1', [member.internalId]);
          await client.query('COMMIT');
          return { gained: match.gained, previousLevel: presentProfile({ fame: match.fame_before }).level,
            profile: presentProfile(fromRow(rows[0])) };
        }
        validateAiVictory(scores);
        if (Date.now() - new Date(match.started_at).getTime() < AI_MIN_MATCH_MS)
          throw new Error('AI 경기가 아직 완료되지 않았습니다.');
        const { rows: locked } = await client.query('SELECT * FROM ucc_profiles WHERE id = $1 FOR UPDATE', [member.internalId]);
        const before = locked[0].fame;
        const gained = AI_WIN_FAME[match.difficulty];
        const { rows: updated } = await client.query('UPDATE ucc_profiles SET fame = fame + $1 WHERE id = $2 RETURNING *',
          [gained, member.internalId]);
        await client.query(`UPDATE ucc_ai_matches SET completed_at = NOW(), gained = $1, fame_before = $2 WHERE id = $3`,
          [gained, before, matchId]);
        await client.query('COMMIT');
        return { gained, previousLevel: presentProfile({ fame: before }).level, profile: presentProfile(fromRow(updated[0])) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async forfeitAiMatch(token, matchId) {
      const member = await this.findByToken(token);
      if (!member?.profile.username) return null;
      await ensureReady();
      const { rows } = await pool.query(
        `UPDATE ucc_ai_matches SET completed_at = NOW(), gained = 0
         WHERE id = $1 AND profile_id = $2 AND completed_at IS NULL RETURNING id`,
        [matchId, member.internalId]
      );
      if (rows.length) return true;
      const existing = await pool.query('SELECT gained FROM ucc_ai_matches WHERE id = $1 AND profile_id = $2',
        [matchId, member.internalId]);
      if (!existing.rows.length) throw new Error('AI 경기 기록을 찾을 수 없습니다.');
      if (existing.rows[0].gained !== 0) throw new Error('AI 경기가 이미 완료되었습니다.');
      return true;
    },
    async awardMatch(matchId, playerIds, winner) {
      await ensureReady();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const results = [];
        for (const [id, index] of playerIds.map((id, index) => [id, index]).sort((a, b) => a[0].localeCompare(b[0]))) {
          const { rows: locked } = await client.query('SELECT * FROM ucc_profiles WHERE id = $1 FOR UPDATE', [id]);
          if (!locked[0]) throw new Error('Match profile missing');
          const row = locked[0];
          const gained = PLAY_FAME + (winner === index ? WIN_FAME : 0);
          const { rows: inserted } = await client.query(
            `INSERT INTO ucc_match_awards (match_id, profile_id, gained, fame_before)
             VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING gained, fame_before`,
            [matchId, id, gained, row.fame]
          );
          const record = inserted[0] || (await client.query(
            'SELECT gained, fame_before FROM ucc_match_awards WHERE match_id = $1 AND profile_id = $2',
            [matchId, id]
          )).rows[0];
          const updated = inserted[0]
            ? (await client.query(`UPDATE ucc_profiles SET fame = fame + $1, played = played + 1,
                wins = wins + $2, losses = losses + $3, draws = draws + $4 WHERE id = $5 RETURNING *`,
                [gained, Number(winner === index), Number(winner !== null && winner !== index), Number(winner === null), id])).rows[0]
            : row;
          results[index] = {
            gained: record.gained,
            previousLevel: presentProfile({ fame: record.fame_before }).level,
            profile: presentProfile(fromRow(updated))
          };
        }
        await client.query('COMMIT');
        return results;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

module.exports = { createProfileStore: (url, options = {}) => url ? createPostgresStore(url) : createMemoryStore(options.now, options.localTestLevel), fameAtLevel, matchOutcome, parseBearer };
