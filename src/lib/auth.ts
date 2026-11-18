import type { AuthUser } from '../types';
import { apiUrl, clearToken, CROSS_ORIGIN_API, readToken, requestInit, saveToken } from './http';

async function request<T>(path: string, init?: RequestInit): Promise<T & { token?: string }> {
  const response = await fetch(apiUrl(path), requestInit(init));
  const body = (await response.json().catch(() => ({}))) as T & { token?: string; error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  // A split deployment receives the session token here, because its cookie is
  // a third-party cookie the browser would drop.
  if (typeof body.token === 'string' && body.token) saveToken(body.token);
  return body;
}

export async function fetchMe(): Promise<AuthUser | null> {
  if (CROSS_ORIGIN_API && !readToken()) return null;
  try {
    const data = await request<{ user: AuthUser | null }>('/api/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

export type SignInResult =
  | { user: AuthUser }
  | { twoFactor: true; ticket: string; hint: string };

export async function signIn(email: string, password: string): Promise<SignInResult> {
  const data = await request<{ user?: AuthUser; twoFactor?: boolean; ticket?: string; hint?: string }>(
    '/api/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  );
  if (data.twoFactor) return { twoFactor: true, ticket: data.ticket ?? '', hint: data.hint ?? '' };
  if (!data.user) throw new Error('Sign in failed.');
  return { user: data.user };
}

/** Second step: the code from the authenticator app, or a recovery code. */
export async function verifyTwoFactor(ticket: string, code: string): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/api/auth/2fa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket, code }),
  });
  return data.user;
}

export interface TwoFactorSetup {
  secret: string;
  uri: string;
  account: string;
}

export async function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  return request<TwoFactorSetup>('/api/auth/2fa/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export async function enableTwoFactor(code: string): Promise<string[]> {
  const data = await request<{ recoveryCodes?: string[] }>('/api/auth/2fa/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return data.recoveryCodes ?? [];
}

export async function disableTwoFactor(password: string): Promise<void> {
  await request('/api/auth/2fa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export async function signUp(name: string, email: string, password: string): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  return data.user;
}

export async function signOut(): Promise<void> {
  try {
    await request('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  } finally {
    clearToken();
  }
}
