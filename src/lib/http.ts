/**
 * Where the API lives, and how the browser proves who it is.
 *
 * Same-origin deployments (Netlify, Cloudflare, `npm run dev`) leave
 * `VITE_API_BASE` unset: requests go to `/api/...` and the session rides in the
 * HttpOnly cookie the API sets.
 *
 * A static host such as GitHub Pages sets `VITE_API_BASE` to the API origin.
 * The page and the API are then different sites, so browsers refuse to send
 * that cookie (third-party cookie blocking). The sign-in response carries the
 * session token in its body instead and the app sends it as a Bearer header.
 */
const configuredBase = (import.meta.env.VITE_API_BASE ?? '').trim();

/** API origin without a trailing slash; empty means "same origin as the page". */
export const API_BASE = configuredBase.replace(/\/+$/, '');
export const CROSS_ORIGIN_API = API_BASE.length > 0;

const TOKEN_KEY = 'cocoachess.session';

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function readToken(): string | null {
  if (!CROSS_ORIGIN_API) return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  if (!CROSS_ORIGIN_API) return;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: sign-in simply will not outlive this tab */
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing stored */
  }
}

/**
 * `fetch` options for an API call that may need the session. Only the
 * Authorization header is added, so public GETs stay simple requests.
 */
export function requestInit(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return {
    ...init,
    headers,
    credentials: CROSS_ORIGIN_API ? 'omit' : 'same-origin',
  };
}
