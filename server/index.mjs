import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { StockfishEngine, findEnginePath } from './engine.mjs';
import { reviewGame, DEPTHS, splitGames, parsePgnHeaders } from './review.mjs';
import { analysisBanter } from './coach.mjs';
import {
  fetchChesscomPlayer,
  fetchLichessPlayer,
  fetchChesscomWeek,
  fetchLichessWeek,
  SourceError,
} from './sources.mjs';
import { registerDevAuth } from './devAuth.mjs';

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(express.json({ limit: '4mb' }));

const engineBinary = findEnginePath();
const threadCount = Math.max(2, Math.min(4, os.cpus()?.length ?? 2));
const engine = engineBinary ? new StockfishEngine(engineBinary, { threads: threadCount, hashMb: 256 }) : null;

if (!engine) {
  console.warn(
    '[engine] No Stockfish binary found. Run `npm run engine:install` or set STOCKFISH_PATH. Reviews will fail until then.',
  );
} else {
  engine.start().catch((error) => console.error('[engine] failed to start:', error.message));
}

const jobs = new Map();
const reportCache = new Map();

function jobEmit(job, event) {
  job.events.push(event);
  for (const listener of job.listeners) {
    try {
      listener(event);
    } catch {
      /* listener closed */
    }
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    engine: engine ? { name: engine.name, ready: engine.ready, threads: threadCount } : null,
    depths: DEPTHS,
  });
});

async function playerHandler(source, username, res) {
  const loader = source === 'chesscom' ? fetchChesscomPlayer : fetchLichessPlayer;
  const data = await loader(username);
  res.json(data);
}

registerDevAuth(app);

app.get('/api/week/:source/:username', async (req, res) => {
  const { source, username } = req.params;
  const { from, to } = req.query;
  if (source !== 'chesscom' && source !== 'lichess') return res.status(400).json({ error: 'Unknown source.' });
  if (!from || !to) return res.status(400).json({ error: 'Missing date range.' });
  try {
    const loader = source === 'chesscom' ? fetchChesscomWeek : fetchLichessWeek;
    res.json(await loader(username, String(from), String(to)));
  } catch (error) {
    const status = error instanceof SourceError ? error.status : 502;
    res.status(status).json({ error: error.message ?? 'Could not load games.' });
  }
});

app.get('/api/players/:source/:username', async (req, res) => {
  const { source, username } = req.params;
  if (source !== 'chesscom' && source !== 'lichess') {
    return res.status(400).json({ error: 'Unknown source.' });
  }
  try {
    await playerHandler(source, username, res);
  } catch (error) {
    const status = error instanceof SourceError ? error.status : 502;
    res.status(status).json({ error: error.message ?? 'Could not load games.' });
  }
});

app.post('/api/pgn/preview', (req, res) => {
  const { pgn } = req.body ?? {};
  if (typeof pgn !== 'string' || !pgn.trim()) return res.status(400).json({ error: 'No PGN provided.' });
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
  res.json({ games });
});

app.post('/api/review', async (req, res) => {
  const { pgn, depth } = req.body ?? {};
  if (typeof pgn !== 'string' || pgn.trim().length < 8) {
    return res.status(400).json({ error: 'Send a PGN to review.' });
  }
  if (!engine) {
    return res.status(503).json({ error: 'Stockfish is not installed on this server. Run `npm run engine:install`.' });
  }
  const requested = Number(depth);
  const resolvedDepth = Object.values(DEPTHS).includes(requested) ? requested : DEPTHS.balanced;
  const cacheKey = crypto.createHash('sha1').update(`${resolvedDepth}:${pgn}`).digest('hex');

  const cached = reportCache.get(cacheKey);
  if (cached) {
    const jobId = crypto.randomUUID();
    const job = {
      id: jobId,
      events: [{ type: 'done', report: cached, cached: true }],
      listeners: new Set(),
      finished: true,
      createdAt: Date.now(),
    };
    jobs.set(jobId, job);
    return res.json({ jobId, cached: true });
  }

  const jobId = crypto.randomUUID();
  const job = {
    id: jobId,
    events: [],
    listeners: new Set(),
    finished: false,
    createdAt: Date.now(),
  };
  jobs.set(jobId, job);
  res.json({ jobId });

  (async () => {
    try {
      jobEmit(job, { type: 'progress', done: 0, total: 1, message: 'Warming up Stockfish 19…' });
      const report = await reviewGame({
        pgn,
        depth: resolvedDepth,
        engine,
        onProgress: async (done, total) => {
          jobEmit(job, {
            type: 'progress',
            done,
            total,
            message: analysisBanter(done, total),
          });
          await new Promise((resolve) => setImmediate(resolve));
        },
      });
      job.finished = true;
      reportCache.set(cacheKey, report);
      if (reportCache.size > 60) reportCache.delete(reportCache.keys().next().value);
      jobEmit(job, { type: 'done', report });
    } catch (error) {
      console.error('[review] failed:', error);
      job.finished = true;
      jobEmit(job, { type: 'error', message: error.message ?? 'The review failed.' });
    }
  })();
});

app.get('/api/review/:jobId/stream', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Unknown review job.' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  for (const event of job.events) send(event);
  if (job.finished) return res.end();

  const listener = (event) => {
    send(event);
    if (event.type === 'done' || event.type === 'error') {
      cleanup();
      res.end();
    }
  };
  const cleanup = () => job.listeners.delete(listener);
  job.listeners.add(listener);
  req.on('close', cleanup);
});

// Serve the production build when it exists (vite preview / node server).
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of jobs) {
    if (job.finished && job.createdAt < cutoff) jobs.delete(id);
  }
}, 5 * 60 * 1000).unref();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] listening on http://127.0.0.1:${PORT} — engine: ${engineBinary ?? 'not found'}`);
});

process.on('SIGINT', async () => {
  await engine?.stop();
  process.exit(0);
});
