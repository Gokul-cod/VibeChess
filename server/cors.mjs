/**
 * CORS for a split deployment: the static app on GitHub Pages, the API on a
 * function host (Netlify Functions or the Cloudflare worker).
 *
 * Same-origin deployments are unaffected: without an `Origin` header (curl,
 * ordinary same-origin GETs) no CORS headers are added at all.
 *
 * The allowlist is comma separated and comes from `COCOACHESS_ALLOWED_ORIGINS`
 * on Netlify and from the `ALLOWED_ORIGINS` variable on the worker. Entries are
 * origins, not paths: `https://someone.github.io`, not the repository URL.
 */

/** Origins the project's own GitHub Pages sites are served from. Keeping these
 *  built in means renaming the account or repository needs no server config. */
const PROJECT_ORIGINS = ['https://gokul-cod.github.io', 'https://cocoachess.github.io'];

function normalizeOrigin(origin) {
  return String(origin).trim().replace(/\/+$/, '');
}

export function allowedOrigins(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => normalizeOrigin(entry))
    .filter(Boolean);
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

/**
 * Headers to echo back for this request. The Origin is reflected rather than
 * set to `*` because credentialed requests cannot use a wildcard.
 */
export function corsHeaders(request, configured) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};

  let originHost = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    return {};
  }

  const sameHost = hostsOf(request).some((host) => host && host === originHost);
  const origin_ = normalizeOrigin(origin);
  if (!sameHost && !allowedOrigins(configured).includes(origin_) && !PROJECT_ORIGINS.includes(origin_)) return {};

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** Answer a CORS preflight, or return null when this is a normal request. */
export function corsPreflight(request, configured) {
  if (request.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(request, configured) });
}

/** Copy CORS headers onto a handler's response. */
export function withCors(response, request, configured) {
  const headers = corsHeaders(request, configured);
  if (!Object.keys(headers).length) return response;
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: merged,
  });
}
