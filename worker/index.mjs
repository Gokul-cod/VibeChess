/**
 * Hosted API for CocoaChess.
 *
 * The native Stockfish 19 binary cannot run on Cloudflare Workers, so this
 * deployment analyses games with the WASM build of the same engine inside the
 * visitor's browser. This worker serves the game data APIs and static assets.
 */
import {
  fetchChesscomPlayer,
  fetchLichessPlayer,
  fetchChesscomWeek,
  fetchLichessWeek,
  SourceError,
} from '../server/sources.mjs';
import { splitGames, parsePgnHeaders, DEPTHS } from '../server/pgn.mjs';
import { corsPreflight, withCors } from '../server/cors.mjs';
import { handleAuth } from './auth.mjs';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function players(source, username) {
  if (source !== 'chesscom' && source !== 'lichess') {
    return json({ error: 'Unknown source.' }, 400);
  }
  const loader = source === 'chesscom' ? fetchChesscomPlayer : fetchLichessPlayer;
  const data = await loader(decodeURIComponent(username));
  return json(data);
}

async function pgnPreview(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Send a PGN as JSON.' }, 400);
  }
  const pgn = body?.pgn;
  if (typeof pgn !== 'string' || !pgn.trim()) return json({ error: 'No PGN provided.' }, 400);
  const games = splitGames(pgn)
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
  return json({ games });
}

async function handleApi(request, env, url) {
  try {
    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        engine: null,
        mode: 'browser',
        engineName: 'Stockfish 19 (WASM)',
        accounts: !!env.DB,
        depths: DEPTHS,
      });
    }
    if (url.pathname.startsWith('/api/players/')) {
      const [, , , source, username] = url.pathname.split('/');
      if (!source || !username) return json({ error: 'Missing player.' }, 400);
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
      return await players(source, username);
    }
    if (url.pathname.startsWith('/api/auth/')) {
      return await handleAuth(request, env, url);
    }
    if (url.pathname.startsWith('/api/week/')) {
      if (request.method !== 'GET') return json({ error: 'Use GET.' }, 405);
      const [, , , source, username] = url.pathname.split('/');
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      if (!source || !username || !from || !to) return json({ error: 'Missing player or date range.' }, 400);
      const loader = source === 'chesscom' ? fetchChesscomWeek : source === 'lichess' ? fetchLichessWeek : null;
      if (!loader) return json({ error: 'Unknown source.' }, 400);
      const payload = await loader(decodeURIComponent(username), from, to);
      return json(payload);
    }
    if (url.pathname === '/api/pgn/preview') {
      if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
      return await pgnPreview(request);
    }
    if (url.pathname === '/api/review') {
      return json(
        {
          error: 'Reviews run in your browser on this deployment. Use the app, which starts the engine locally.',
        },
        503,
      );
    }
    return json({ error: 'Not found.' }, 404);
  } catch (error) {
    const status = error instanceof SourceError ? error.status : 502;
    return json({ error: error?.message ?? 'Request failed.' }, status);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS only matters for a split deployment (static app on GitHub Pages),
    // where the allowed origins come from the ALLOWED_ORIGINS variable.
    const preflight = corsPreflight(request, env?.ALLOWED_ORIGINS);
    if (preflight) return preflight;

    if (url.pathname.startsWith('/api/')) {
      return withCors(await handleApi(request, env, url), request, env?.ALLOWED_ORIGINS);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404 && request.method === 'GET' && !url.pathname.split('/').pop()?.includes('.')) {
      return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    }
    return asset;
  },
};
