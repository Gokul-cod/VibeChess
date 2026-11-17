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

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const data = await request<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return data.user;
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
