/**
 * Local development accounts.
 *
 * The hosted app stores accounts in Cloudflare D1 (see worker/auth.mjs). This
 * in-memory version keeps `npm run dev` usable without any cloud binding; it is
 * only registered by the Express dev server.
 */
import crypto from 'node:crypto';
import { makeRecoveryCodes, newTotpSecret, normalizeRecovery, totpUri, verifyTotp } from '../worker/auth.mjs';

const users = new Map();
const sessions = new Map();
const tickets = new Map();
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
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, twoFactor: !!user.totpEnabled };
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
    if (user.totpEnabled) {
      const ticket = crypto.randomBytes(24).toString('hex');
      tickets.set(ticket, { userId: user.id, expires: Date.now() + 10 * 60_000, attempts: 0 });
      const [local, domain] = user.email.split('@');
      const masked = `${local.slice(0, 2)}${'•'.repeat(Math.max(1, local.length - 2))}@${domain}`;
      return res.json({ twoFactor: true, ticket, hint: masked });
    }
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/2fa/verify', async (req, res) => {
    const ticket = String(req.body?.ticket ?? '').trim();
    const code = String(req.body?.code ?? '').replace(/\s+/g, '');
    const pending = tickets.get(ticket);
    if (!pending || pending.expires < Date.now()) {
      return res.status(400).json({ error: 'That sign-in attempt has expired. Enter your password again.' });
    }
    if (pending.attempts >= 5) {
      tickets.delete(ticket);
      return res.status(429).json({ error: 'Too many wrong codes. Sign in again.' });
    }
    pending.attempts += 1;
    const user = users.get(pending.userId);
    if (!user?.totpEnabled) return res.status(400).json({ error: 'Sign in again.' });

    let ok = await verifyTotp(user.totpSecret, code);
    if (!ok) {
      const normalized = normalizeRecovery(code);
      const match = (user.recoveryCodes ?? []).find((entry) => normalizeRecovery(entry) === normalized);
      if (match) {
        ok = true;
        user.recoveryCodes = user.recoveryCodes.filter((entry) => entry !== match);
      }
    }
    if (!ok) return res.status(401).json({ error: 'That code is not right. Check the app and try the next one.' });
    tickets.delete(ticket);
    startSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  app.post('/api/auth/2fa/setup', (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    if (user.totpEnabled) return res.status(409).json({ error: 'Two-factor authentication is already on.' });
    user.totpSecret = newTotpSecret();
    res.json({ secret: user.totpSecret, uri: totpUri(user.email, user.totpSecret), account: user.email });
  });

  app.post('/api/auth/2fa/enable', async (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    if (user.totpEnabled) return res.status(409).json({ error: 'Two-factor authentication is already on.' });
    if (!user.totpSecret) return res.status(400).json({ error: 'Start the setup again to get a new key.' });
    if (!(await verifyTotp(user.totpSecret, String(req.body?.code ?? '').replace(/\s+/g, '')))) {
      return res.status(400).json({ error: 'That code did not match. Wait for the next one and try again.' });
    }
    user.totpEnabled = true;
    user.recoveryCodes = makeRecoveryCodes();
    res.json({ enabled: true, recoveryCodes: user.recoveryCodes });
  });

  app.post('/api/auth/2fa/disable', (req, res) => {
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: 'Sign in first.' });
    const password = String(req.body?.password ?? '');
    if (hash(password, user.salt) !== user.hash) return res.status(401).json({ error: 'That password is not right.' });
    user.totpEnabled = false;
    user.totpSecret = null;
    user.recoveryCodes = [];
    res.json({ enabled: false });
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = parseCookies(req)[COOKIE];
    if (token) sessions.delete(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.json({ ok: true });
  });
}
