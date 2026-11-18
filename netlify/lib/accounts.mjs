/**
 * Accounts for the Netlify deployment of CocoaChess.
 *
 * The same model as the Cloudflare worker: email + password, PBKDF2-SHA256
 * hashes, and an opaque session token in an HttpOnly cookie. Records are kept
 * in Netlify Blobs instead of D1, so the port needs no external database.
 */

const SESSION_COOKIE = 'vc_session';
const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USER_KEY = (email) => `users/${email}`;
const SESSION_KEY = (tokenHash) => `sessions/${tokenHash}`;

const encoder = new TextEncoder();

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
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
 * `Secure` is skipped on plain-http local dev so the cookie is stored.
 * `SameSite=None` is only for a split deployment, where the page lives on
 * another site than this API (and browsers then require `Secure`).
 */
function sessionCookie(token, maxAgeSeconds, secure, crossSite) {
  const sameSite = crossSite ? 'None' : 'Lax';
  const flags = `Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${flags}`;
}

function hostsOf(request) {
  return [
    safeHost(request.url),
    request.headers.get('host'),
    request.headers.get('x-forwarded-host'),
  ];
}

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function allowedOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function sameOrigin(request, configured) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser clients such as curl do not send Origin
  const originHost = safeHost(origin);
  if (!originHost) return false;
  // Netlify may report the request under an internal or forwarded host, so
  // compare hosts rather than full origins (scheme differences included).
  if (hostsOf(request).some((host) => host && host === originHost)) return true;
  // A split deployment: the static app runs on another site (GitHub Pages).
  return allowedOrigins(configured).includes(origin.trim().replace(/\/+$/, ''));
}

/** The page is on a different site than this API, so cookies cannot be relied on. */
function crossSite(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  const originHost = safeHost(origin);
  if (!originHost) return false;
  return !hostsOf(request).some((host) => host && host === originHost);
}

/** Bearer token for split deployments, cookie for same-origin ones. */
function requestToken(request) {
  const match = /^Bearer\s+(\S+)$/i.exec((request.headers.get('Authorization') ?? '').trim());
  return match ? match[1] : cookieValue(request, SESSION_COOKIE);
}

function clientIp(request) {
  return (
    request.headers.get('x-nf-client-connection-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local'
  );
}

function publicUser(record) {
  return { id: record.id, email: record.email, name: record.name, createdAt: record.createdAt };
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

async function createSession(store, record) {
  const token = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  await store.setJSON(SESSION_KEY(tokenHash), {
    tokenHash,
    userId: record.id,
    email: record.email,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86_400_000).toISOString(),
  });
  return token;
}

export async function currentUser(request, store) {
  if (!store) return null;
  const token = requestToken(request);
  if (!token) return null;
  try {
    const tokenHash = await sha256Hex(token);
    const session = await store.get(SESSION_KEY(tokenHash), { type: 'json' });
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      await store.delete(SESSION_KEY(tokenHash));
      return null;
    }
    const user = await store.get(USER_KEY(session.email), { type: 'json' });
    return user ? publicUser(user) : null;
  } catch (error) {
    console.error('[auth] session lookup failed', error?.message ?? error);
    return null;
  }
}

/* ------------------------------ handlers ----------------------------- */

export async function handleAuth(request, store, url, configuredOrigins = '') {
  const path = url.pathname;
  const crossSiteRequest = crossSite(request);
  // SameSite=None cookies only travel over https, so a split deployment is https-only.
  const secure =
    crossSiteRequest || url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const cookieFor = (token, maxAgeSeconds) => sessionCookie(token, maxAgeSeconds, secure, crossSiteRequest);

  if (path === '/api/auth/me') {
    const user = await currentUser(request, store);
    return json({ user });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(request, configuredOrigins)) return json({ error: 'Cross-origin request blocked.' }, 403);

  if (!store) {
    return json({ error: 'Accounts are not configured on this deployment.' }, 503);
  }

  // Logout has no payload; handle it before the JSON parse.
  if (path === '/api/auth/logout') {
    const token = requestToken(request);
    if (token) {
      try {
        await store.delete(SESSION_KEY(await sha256Hex(token)));
      } catch {
        /* clearing the cookie is enough for this browser */
      }
    }
    return json({ ok: true }, 200, { 'Set-Cookie': cookieFor('', 0) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a JSON body.' }, 400);
  }

  if (!throttle(`${path}:${clientIp(request)}`)) {
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
      const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
      const record = {
        id: crypto.randomUUID(),
        email,
        name,
        passwordHash: await hashPassword(password, salt),
        passwordSalt: salt,
        createdAt: new Date().toISOString(),
      };
      // The conditional write keeps the email unique even if two signups race.
      const written = await store.setJSON(USER_KEY(email), record, { onlyIfNew: true });
      if (!written?.modified) {
        return json({ error: 'An account with that email already exists. Sign in instead.' }, 409);
      }
      const token = await createSession(store, record);
      return json({ user: publicUser(record), ...(crossSiteRequest ? { token } : {}) }, 201, {
        'Set-Cookie': cookieFor(token, SESSION_DAYS * 86_400),
      });
    } catch (error) {
      console.error('[auth] signup failed', error);
      return json({ error: 'Could not create the account right now. Try again shortly.' }, 500);
    }
  }

  if (path === '/api/auth/login') {
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');
    if (!email || !password) return json({ error: 'Email and password are required.' }, 400);

    try {
      const record = await store.get(USER_KEY(email), { type: 'json' });
      if (!record) return json({ error: 'Email or password is incorrect.' }, 401);
      const hash = await hashPassword(password, record.passwordSalt);
      if (!safeEqual(hash, record.passwordHash)) return json({ error: 'Email or password is incorrect.' }, 401);

      const token = await createSession(store, record);
      return json({ user: publicUser(record), ...(crossSiteRequest ? { token } : {}) }, 200, {
        'Set-Cookie': cookieFor(token, SESSION_DAYS * 86_400),
      });
    } catch (error) {
      console.error('[auth] login failed', error);
      return json({ error: 'Could not sign in right now. Try again shortly.' }, 500);
    }
  }

  return json({ error: 'Not found.' }, 404);
}
