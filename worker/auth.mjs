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
    ])
      .then(() => true)
      .catch((error) => {
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
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
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
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
    const user = await env.DB.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
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
