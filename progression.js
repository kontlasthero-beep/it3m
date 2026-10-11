const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);

const PLAY_FAME = 50;
const WIN_FAME = 50;
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
    draws: row.draws || 0
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

function createMemoryStore() {
  const profiles = new Map();
  const usernames = new Map();
  const tokens = new Map();
  const awards = new Map();
  const pending = new Set();
  const lookup = token => profiles.get(tokens.get(tokenHash(token)));
  return {
    persistent: false,
    async createGuest(name) {
      const token = newSession();
      const row = { id: crypto.randomUUID(), publicId: newPublicId(), name: normalizeName(name || '게스트'), fame: 0,
        played: 0, wins: 0, losses: 0, draws: 0 };
      profiles.set(row.id, row);
      tokens.set(tokenHash(token), row.id);
      return { token, profile: presentProfile(row) };
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
        return { token, profile: presentProfile(row) };
      } finally { pending.delete(username); }
    },
    async login(usernameInput, passwordInput) {
      const row = profiles.get(usernames.get(normalizeUsername(usernameInput)));
      if (!row || !(await verifyPassword(String(passwordInput || ''), row.passwordHash))) return null;
      const token = newSession();
      tokens.set(tokenHash(token), row.id);
      return { token, profile: presentProfile(row) };
    },
    async findByToken(token) {
      const row = lookup(token);
      return row ? { internalId: row.id, profile: presentProfile(row) } : null;
    },
    async rename(token, name) {
      const row = lookup(token);
      if (!row) return null;
      row.name = normalizeName(name);
      return presentProfile(row);
    },
    async logout(token) { tokens.delete(tokenHash(token)); },
    async awardMatch(matchId, playerIds, winner) {
      return playerIds.map((id, index) => {
        const row = profiles.get(id);
        if (!row) return null;
        const key = `${matchId}:${id}`;
        let record = awards.get(key);
        if (!record) {
          const gained = PLAY_FAME + (winner === index ? WIN_FAME : 0);
          record = { gained, previousLevel: presentProfile(row).level };
          awards.set(key, record);
          row.fame += gained;
          row.played += 1;
          if (winner === null) row.draws += 1;
          else if (winner === index) row.wins += 1;
          else row.losses += 1;
        }
        return { gained: record.gained, previousLevel: record.previousLevel, profile: presentProfile(row) };
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
        ADD COLUMN IF NOT EXISTS draws INTEGER NOT NULL DEFAULT 0`);
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
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  function fromRow(row) {
    return { id: row.id, publicId: row.public_id, username: row.username, name: row.name, fame: row.fame,
      played: row.played, wins: row.wins, losses: row.losses, draws: row.draws };
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
    async logout(token) {
      await ensureReady();
      await pool.query('DELETE FROM ucc_sessions WHERE token_hash = $1', [tokenHash(token)]);
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

module.exports = { createProfileStore: url => url ? createPostgresStore(url) : createMemoryStore(), fameAtLevel, matchOutcome, parseBearer };
