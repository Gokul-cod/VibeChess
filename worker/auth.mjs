/**
 * Accounts for CocoaChess.
 *
 * Email + password accounts stored in D1, PBKDF2-SHA256 password hashes, and
 * opaque session tokens in an HttpOnly cookie. No third-party auth service.
 */

const SESSION_COOKIE = 'vc_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const encoder = new TextEncoder();

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieValue(request, name) {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * `SameSite=None` is only for a split deployment, where the static app runs on
 * another site than this worker. Everything is https here, so `Secure` is fine.
 */
function sessionCookie(token, maxAgeSeconds, crossSite) {
  const sameSite = crossSite ? 'None' : 'Lax';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}`;
}

function hostsOf(request) {
  const hosts = [];
  try {
    hosts.push(new URL(request.url).host);
  } catch {
    /* ignore */
  }
  hosts.push(request.headers.get('host'), request.headers.get('x-forwarded-host'));
  return hosts;
}

function allowedOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function sameOrigin(request, configured) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // same-origin fetches from browsers still send Origin for POST; be lenient for curl.
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (hostsOf(request).some((host) => host && host === originHost)) return true;
  // A split deployment: the static app runs on another site (GitHub Pages).
  return allowedOrigins(configured).includes(origin.trim().replace(/\/+$/, ''));
}

/** The page is on a different site than this worker, so cookies cannot be relied on. */
function crossSite(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return !hostsOf(request).some((host) => host && host === originHost);
}

/** Bearer token for split deployments, cookie for same-origin ones. */
function requestToken(request) {
  const match = /^Bearer\s+(\S+)$/i.exec((request.headers.get('Authorization') ?? '').trim());
  return match ? match[1] : cookieValue(request, SESSION_COOKIE);
}

/* --------------------------- one-time codes --------------------------- */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
const TICKET_MINUTES = 10;
const TICKET_ATTEMPTS = 5;

function base32Encode(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(secret) {
  const clean = String(secret).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

async function hmacSha1(keyBytes, messageBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, messageBytes));
}

/** RFC 6238 / RFC 4226 code for one 30-second step. */
export async function totpAt(secret, step) {
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const mac = await hmacSha1(base32Decode(secret), counter);
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    (((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]) % 1_000_000;
  return String(code).padStart(6, '0');
}

/** Accepts the current step and one either side, for clock drift. */
export async function verifyTotp(secret, code) {
  if (!secret || !/^\d{6}$/.test(code)) return false;
  const step = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);
  for (const drift of [-1, 0, 1]) {
    if (safeEqual(await totpAt(secret, step + drift), code)) return true;
  }
  return false;
}

export function newTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function totpUri(email, secret) {
  const label = encodeURIComponent(`CocoaChess:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=CocoaChess&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}

export function makeRecoveryCodes(count = 8) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const raw = bytesToHex(crypto.getRandomValues(new Uint8Array(5))).toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return codes;
}

export function normalizeRecovery(code) {
  return String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * A password that checked out, waiting for the authenticator code. The ticket
 * is an opaque row so it can expire and be thrown away after too many tries.
 */
async function createTicket(env, userId) {
  const id = bytesToHex(crypto.getRandomValues(new Uint8Array(24)));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO login_tickets (id, user_id, created_at, expires_at, attempts) VALUES (?, ?, ?, ?, 0)')
    .bind(id, userId, new Date(now).toISOString(), new Date(now + TICKET_MINUTES * 60_000).toISOString())
    .run();
  await env.DB.prepare('DELETE FROM login_tickets WHERE expires_at < ?')
    .bind(new Date(now - 86_400_000).toISOString())
    .run();
  return id;
}

/* ------------------------------ schema ------------------------------ */

let schemaReady = null;

export async function ensureSchema(env) {
  if (!env?.DB) throw new Error('Account database is not configured.');
  if (!schemaReady) {
    schemaReady = env.DB.batch([
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS users (
           id TEXT PRIMARY KEY,
           email TEXT NOT NULL UNIQUE,
           name TEXT NOT NULL,
           password_hash TEXT NOT NULL,
           password_salt TEXT NOT NULL,
           created_at TEXT NOT NULL
         )`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS sessions (
           token_hash TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           created_at TEXT NOT NULL,
           expires_at TEXT NOT NULL
         )`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS login_tickets (
           id TEXT PRIMARY KEY,
           user_id TEXT NOT NULL,
           created_at TEXT NOT NULL,
           expires_at TEXT NOT NULL,
           attempts INTEGER NOT NULL DEFAULT 0
         )`,
      ),
      env.DB.prepare(
        `CREATE TABLE IF NOT EXISTS recovery_codes (
           user_id TEXT NOT NULL,
           code_hash TEXT NOT NULL,
           used_at TEXT,
           PRIMARY KEY (user_id, code_hash)
         )`,
      ),
    ])
      .then(async () => {
        await ensureColumns(env);
        return true;
      })
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}

/** Columns added after the first release; SQLite has no `ADD COLUMN IF NOT EXISTS`. */
async function ensureColumns(env) {
  const columns = ['totp_secret TEXT', 'totp_enabled INTEGER NOT NULL DEFAULT 0'];
  for (const column of columns) {
    try {
      await env.DB.prepare(`ALTER TABLE users ADD COLUMN ${column}`).run();
    } catch (error) {
      if (!/duplicate column name/i.test(String(error?.message ?? ''))) throw error;
    }
  }
}

/* ---------------------------- rate limit ---------------------------- */

const buckets = new Map();

function throttle(key, limit = 12, windowMs = 60_000) {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now - entry.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

/* ----------------------------- sessions ----------------------------- */

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    twoFactor: !!row.totp_enabled,
  };
}

async function createSession(env, userId) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(tokenHash, userId, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 86_400_000).toISOString())
    .run();
  return token;
}

export async function currentUser(request, env) {
  if (!env?.DB) return null;
  const token = requestToken(request);
  if (!token) return null;
  try {
    await ensureSchema(env);
    const tokenHash = await sha256Hex(token);
    const session = await env.DB.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
      .bind(tokenHash)
      .first();
    if (!session) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
      return null;
    }
    const user = await env.DB.prepare('SELECT id, email, name, created_at, totp_enabled FROM users WHERE id = ?')
      .bind(session.user_id)
      .first();
    return user ? publicUser(user) : null;
  } catch {
    return null;
  }
}

/* ------------------------------ handlers ----------------------------- */

export async function handleAuth(request, env, url) {
  const path = url.pathname;
  const crossSiteRequest = crossSite(request);
  const cookieFor = (token, maxAgeSeconds) => sessionCookie(token, maxAgeSeconds, crossSiteRequest);

  if (path === '/api/auth/me') {
    const user = await currentUser(request, env);
    return json({ user });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(request, env?.ALLOWED_ORIGINS)) return json({ error: 'Cross-origin request blocked.' }, 403);

  // Logout has no payload; handle it before the JSON parse.
  if (path === '/api/auth/logout') {
    const token = requestToken(request);
    if (token) {
      try {
        await ensureSchema(env);
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
      } catch {
        /* clearing the cookie is enough for this browser */
      }
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': cookieFor('', 0),
      },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!throttle(`${path}:${ip}`)) {
    return json({ error: 'Too many attempts. Wait a minute and try again.' }, 429);
  }

  // Second step of a sign-in: the password was right, now the OTP.
  if (path === '/api/auth/2fa/verify') {
    const ticket = String(body?.ticket ?? '').trim();
    const code = String(body?.code ?? '').replace(/\s+/g, '');
    if (!ticket || !code) return json({ error: 'Enter the code from your authenticator app.' }, 400);

    try {
      await ensureSchema(env);
      const pending = await env.DB.prepare('SELECT * FROM login_tickets WHERE id = ?').bind(ticket).first();
      if (!pending) return json({ error: 'That sign-in attempt has expired. Enter your password again.' }, 400);
      if (new Date(pending.expires_at).getTime() < Date.now()) {
        await env.DB.prepare('DELETE FROM login_tickets WHERE id = ?').bind(ticket).run();
        return json({ error: 'That sign-in attempt has expired. Enter your password again.' }, 400);
      }
      if (pending.attempts >= TICKET_ATTEMPTS) {
        await env.DB.prepare('DELETE FROM login_tickets WHERE id = ?').bind(ticket).run();
        return json({ error: 'Too many wrong codes. Sign in again.' }, 429);
      }

      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(pending.user_id).first();
      if (!row || !row.totp_enabled) return json({ error: 'Sign in again.' }, 400);
      await env.DB.prepare('UPDATE login_tickets SET attempts = attempts + 1 WHERE id = ?').bind(ticket).run();

      let verified = await verifyTotp(row.totp_secret, code);
      if (!verified) {
        // A recovery code stands in for the app when the phone is gone.
        const normalized = normalizeRecovery(code);
        if (normalized.length === 10) {
          const hash = await sha256Hex(normalized);
          const spare = await env.DB.prepare(
            'SELECT code_hash FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
          )
            .bind(row.id, hash)
            .first();
          if (spare) {
            verified = true;
            await env.DB.prepare('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ?')
              .bind(new Date().toISOString(), row.id, hash)
              .run();
          }
        }
      }
      if (!verified) return json({ error: 'That code is not right. Check the app and try the next one.' }, 401);

      await env.DB.prepare('DELETE FROM login_tickets WHERE id = ?').bind(ticket).run();
      const token = await createSession(env, row.id);
      return new Response(JSON.stringify({ user: publicUser(row), ...(crossSiteRequest ? { token } : {}) }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'Set-Cookie': cookieFor(token, SESSION_DAYS * 86_400),
        },
      });
    } catch (error) {
      console.error('[auth] 2fa verify failed', error);
      return json({ error: 'Could not check that code right now. Try again shortly.' }, 500);
    }
  }

  if (path === '/api/auth/2fa/setup' || path === '/api/auth/2fa/enable' || path === '/api/auth/2fa/disable') {
    const user = await currentUser(request, env);
    if (!user) return json({ error: 'Sign in first.' }, 401);

    try {
      await ensureSchema(env);
      const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
      if (!row) return json({ error: 'Sign in first.' }, 401);

      if (path === '/api/auth/2fa/setup') {
        if (row.totp_enabled) return json({ error: 'Two-factor authentication is already on.' }, 409);
        const secret = newTotpSecret();
        await env.DB.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?').bind(secret, row.id).run();
        return json({ secret, uri: totpUri(row.email, secret), account: row.email });
      }

      if (path === '/api/auth/2fa/enable') {
        if (row.totp_enabled) return json({ error: 'Two-factor authentication is already on.' }, 409);
        if (!row.totp_secret) return json({ error: 'Start the setup again to get a new key.' }, 400);
        const code = String(body?.code ?? '').replace(/\s+/g, '');
        if (!(await verifyTotp(row.totp_secret, code))) {
          return json({ error: 'That code did not match. Wait for the next one and try again.' }, 400);
        }

        const codes = makeRecoveryCodes();
        const hashes = await Promise.all(codes.map((entry) => sha256Hex(normalizeRecovery(entry))));
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').bind(row.id),
          env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(row.id),
          ...hashes.map((hash) =>
            env.DB.prepare('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)').bind(row.id, hash),
          ),
        ]);
        return json({ enabled: true, recoveryCodes: codes });
      }

      // disable
      const password = String(body?.password ?? '');
      if (!password) return json({ error: 'Enter your password to turn this off.' }, 400);
      const hash = await hashPassword(password, row.password_salt);
      if (!safeEqual(hash, row.password_hash)) return json({ error: 'That password is not right.' }, 401);
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').bind(row.id),
        env.DB.prepare('DELETE FROM recovery_codes WHERE user_id = ?').bind(row.id),
      ]);
      return json({ enabled: false });
    } catch (error) {
      console.error('[auth] 2fa change failed', error);
      return json({ error: 'Could not update two-factor authentication right now. Try again shortly.' }, 500);
    }
  }

  if (path === '/api/auth/signup') {
    const name = String(body?.name ?? '').trim().slice(0, 60);
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    if (name.length < 2) return json({ error: 'Tell us your name (at least 2 characters).' }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: 'That email address does not look right.' }, 400);
    if (password.length < 8) return json({ error: 'Use a password with at least 8 characters.' }, 400);

    try {
      await ensureSchema(env);
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) return json({ error: 'An account with that email already exists. Sign in instead.' }, 409);

      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await hashPassword(password, salt);
      const id = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO users (id, email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
        .bind(id, email, name, hash, salt, new Date().toISOString())
        .run();
      const token = await createSession(env, id);
      return new Response(
        JSON.stringify({
          user: { id, email, name, createdAt: new Date().toISOString() },
          ...(crossSiteRequest ? { token } : {}),
        }),
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Set-Cookie': cookieFor(token, SESSION_DAYS * 86_400),
          },
        },
      );
    } catch (error) {
      const message = String(error?.message ?? '');
      if (message.includes('UNIQUE')) return json({ error: 'An account with that email already exists. Sign in instead.' }, 409);
      console.error('[auth] signup failed', error);
      return json({ error: 'Could not create the account right now. Try again shortly.' }, 500);
    }
  }

  if (path === '/api/auth/login') {
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!email || !password) return json({ error: 'Email and password are required.' }, 400);

    try {
      await ensureSchema(env);
      const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
      if (!row) return json({ error: 'Email or password is incorrect.' }, 401);
      const hash = await hashPassword(password, row.password_salt);
      if (!safeEqual(hash, row.password_hash)) return json({ error: 'Email or password is incorrect.' }, 401);

      // With 2FA on, the password only earns a ticket; the code finishes the job.
      if (row.totp_enabled) {
        const ticket = await createTicket(env, row.id);
        const [local, domain] = row.email.split('@');
        const masked = `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
        return json({ twoFactor: true, ticket, hint: masked });
      }

      const token = await createSession(env, row.id);
      return new Response(
        JSON.stringify({ user: publicUser(row), ...(crossSiteRequest ? { token } : {}) }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Set-Cookie': cookieFor(token, SESSION_DAYS * 86_400),
          },
        },
      );
    } catch (error) {
      console.error('[auth] login failed', error);
      return json({ error: 'Could not sign in right now. Try again shortly.' }, 500);
    }
  }

  return json({ error: 'Not found.' }, 404);
}
