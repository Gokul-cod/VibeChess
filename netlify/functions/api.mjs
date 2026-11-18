/**
 * The CocoaChess API as a Netlify Function.
 *
 * Same routes and payloads as the Cloudflare worker in `worker/index.mjs`, but
 * on Netlify's runtime. Accounts live in Netlify Blobs; game reviews still run
 * in the visitor's browser on Stockfish 19 (WASM), because a native engine
 * cannot run in a function.
 *
 * netlify.toml rewrites /api/* here, so the public routes are /api/...
 */
import {
  fetchChesscomPlayer,
  fetchLichessPlayer,
  fetchChesscomWeek,
  fetchLichessWeek,
  SourceError,
} from '../../server/sources.mjs';
import { splitGames, parsePgnHeaders, DEPTHS } from '../../server/pgn.mjs';
import { handleAuth } from '../lib/accounts.mjs';
import { openStore } from '../lib/store.mjs';
import { corsPreflight, withCors } from '../../server/cors.mjs';

const FUNCTION_PREFIX = '/.netlify/functions/api';

/**
 * Origins allowed to call this API from another site, such as the GitHub Pages
 * copy of the app. Set COCOACHESS_ALLOWED_ORIGINS in the Netlify UI, e.g.
 * `https://yourname.github.io`. Empty means same-origin only.
 */
const ALLOWED_ORIGINS = process.env.COCOACHESS_ALLOWED_ORIGINS ?? '';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * The public URL of the request. Netlify may hand the function the rewritten
 * path (/.netlify/functions/api/...) or the original one, so normalise both to
 * the /api/... route the app calls.
 */
export function publicUrl(requestUrl) {
  const url = new URL(requestUrl);
  let pathname = url.pathname;
  if (pathname === FUNCTION_PREFIX || pathname.startsWith(`${FUNCTION_PREFIX}/`)) {
    pathname = pathname.slice(FUNCTION_PREFIX.length) || '/';
  }
  if (pathname !== '/api' && !pathname.startsWith('/api/')) pathname = `/api${pathname}`;
  const normalized = new URL(url);
  normalized.pathname = pathname;
  return normalized;
}

function pgnPreviewGames(pgn) {
  return splitGames(pgn)
    .slice(0, 60)
    .map((game, index) => {
      const headers = parsePgnHeaders(game);
      return {
        id: `pgn-${index}`,
        source: 'pgn',
        url: null,
        pgn: game,
        white: headers.White ?? 'White',
        black: headers.Black ?? 'Black',
        whiteElo: headers.WhiteElo ?? null,
        blackElo: headers.BlackElo ?? null,
        result: headers.Result ?? '*',
        outcome: 'imported',
        playerColor: null,
        date: headers.UTCDate ?? headers.Date ?? null,
        timeClass: null,
        timeControl: headers.TimeControl ?? null,
        rated: null,
        opening: headers.Opening ?? null,
      };
    });
}

async function handle(request) {
  const url = publicUrl(request.url);
  const pathname = url.pathname;

  try {
    if (pathname === '/api/health') {
      return json({
        ok: true,
        engine: null,
        mode: 'browser',
        engineName: 'Stockfish 19 (WASM)',
        accounts: !!openStore(),
        depths: DEPTHS,
      });
    }

    if (pathname.startsWith('/api/auth/')) {
      return await handleAuth(request, openStore(), url, ALLOWED_ORIGINS);
    }

    if (pathname === '/api/review') {
      // Reviews are analysed in the browser on this deployment.
      return json(
        {
          error:
            'Reviews run in your browser on this deployment. Use the app, which starts the engine locally.',
        },
        503,
      );
    }

    if (pathname === '/api/pgn/preview') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'Send a PGN as JSON.' }, 400);
      }
      const pgn = body?.pgn;
      if (typeof pgn !== 'string' || !pgn.trim()) return json({ error: 'No PGN provided.' }, 400);
      return json({ games: pgnPreviewGames(pgn) });
    }

    if (pathname.startsWith('/api/players/')) {
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
      const [, , , source, username] = pathname.split('/');
      if (!source || !username) return json({ error: 'Missing player.' }, 400);
      if (source !== 'chesscom' && source !== 'lichess') return json({ error: 'Unknown source.' }, 400);
      const loader = source === 'chesscom' ? fetchChesscomPlayer : fetchLichessPlayer;
      return json(await loader(decodeURIComponent(username)));
    }

    if (pathname.startsWith('/api/week/')) {
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
      const [, , , source, username] = pathname.split('/');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!source || !username || !from || !to) return json({ error: 'Missing player or date range.' }, 400);
      const loader = source === 'chesscom' ? fetchChesscomWeek : source === 'lichess' ? fetchLichessWeek : null;
      if (!loader) return json({ error: 'Unknown source.' }, 400);
      return json(await loader(decodeURIComponent(username), from, to));
    }

    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    const status = error instanceof SourceError ? error.status : 502;
    console.error('[api] request failed', error);
    return json({ error: error?.message ?? 'Request failed.' }, status);
  }
}

export default async (request) => {
  const preflight = corsPreflight(request, ALLOWED_ORIGINS);
  if (preflight) return preflight;
  return withCors(await handle(request), request, ALLOWED_ORIGINS);
};
