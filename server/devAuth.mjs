/**
 * Local development accounts.
 *
 * The hosted app stores accounts in Cloudflare D1 (see worker/auth.mjs). This
 * in-memory version keeps `npm run dev` usable without any cloud binding; it is
 * only registered by the Express dev server.
 */
import crypto from 'node:crypto';

const users = new Map();
const sessions = new Map();
const COOKIE = 'vc_session';
const SESSION_MS = 30 * 86_400_000;

function hash(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100_000, 32, 'sha256').toString('hex');
}

function parseCookies(request) {
  const header = request.headers.cookie ?? '';
  const jar = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key) jar[key] = decodeURIComponent(rest.join('='));
  }
  return jar;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expires: Date.now() + SESSION_MS });
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}`,
  );
}

function sessionUser(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expires < Date.now()) return null;
  return [...users.values()].find((user) => user.id === session.userId) ?? null;
}

export function registerDevAuth(app) {
  app.get('/api/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const user = sessionUser(req);
    res.json({ user: user ? publicUser(user) : null });
  });

  app.post('/api/auth/signup', (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 60);
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (name.length < 2) return res.status(400).json({ error: 'Tell us your name (at least 2 characters).' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'That email address does not look right.' });
    if (password.length < 8) return res.status(400).json({ error: 'Use a password with at least 8 characters.' });
    if ([...users.values()].some((user) => user.email === email)) {
      return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: crypto.randomUUID(),
      email,
      name,
      salt,
      hash: hash(password, salt),
      createdAt: new Date().toISOString(),
    };
    users.set(user.id, user);
    startSession(res, user.id);
    res.status(201).json({ user: publicUser(user) });
  });

  app.post('/api/auth/login', (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const user = [...users.values()].find((candidate) => candidate.email === email);
    if (!user || hash(password, user.salt) !== user.hash) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE];
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });
}
