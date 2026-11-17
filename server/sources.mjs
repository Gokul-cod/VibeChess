const USER_AGENT = 'VibeChess/1.0 (chess review and weekly reports)';

export class SourceError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const cache = new Map();
const CACHE_TTL = 2 * 60 * 1000;

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size > 200) cache.clear();
  cache.set(key, { time: Date.now(), value });
}

async function request(url, { accept = 'application/json', timeout = 15_000 } = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new SourceError('Could not reach the chess site. Check the connection and try again.', 504);
  }
  if (response.status === 404) throw new SourceError('No player with that username was found.', 404);
  if (response.status === 429) throw new SourceError('That site is rate limiting us. Try again in a minute.', 429);
  if (!response.ok) throw new SourceError(`The chess site responded with ${response.status}.`, 502);
  return response;
}

function headerValue(pgn, name) {
  const match = new RegExp(`\\[\\s*${name}\\s+"([^"]*)"\\s*\\]`).exec(pgn ?? '');
  return match ? match[1] : null;
}

function openingFromPgn(pgn) {
  const named = headerValue(pgn, 'Opening');
  if (named) return named;
  const ecoUrl = headerValue(pgn, 'ECOUrl');
  if (ecoUrl) {
    const slug = ecoUrl.split('/').filter(Boolean).pop() ?? '';
    return decodeURIComponent(slug).replace(/-/g, ' ').replace(/\s+\d{4}\.\d{2}\.\d{2}.*$/, '') || null;
  }
  return null;
}

function dateFromPgn(pgn) {
  const date = headerValue(pgn, 'UTCDate') ?? headerValue(pgn, 'Date');
  const time = headerValue(pgn, 'UTCTime');
  if (!date || date.includes('?')) return null;
  const iso = date.replace(/\./g, '-') + (time ? `T${time}Z` : '');
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function friendlyResult(result, playerColor) {
  if (!result || result === '*') return 'unfinished';
  if (result === '1/2-1/2') return 'draw';
  const won = (playerColor === 'white' && result === '1-0') || (playerColor === 'black' && result === '0-1');
  return won ? 'win' : 'loss';
}

export async function fetchChesscomPlayer(username) {
  const handle = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(handle)) throw new SourceError('That does not look like a Chess.com username.', 400);
  const cacheKey = `chesscom:${handle}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const profile = await request(`https://api.chess.com/pub/player/${handle}`).then((r) => r.json());
  let archives = [];
  try {
    const archiveResponse = await request(`https://api.chess.com/pub/player/${handle}/games/archives`).then((r) => r.json());
    archives = (archiveResponse.archives ?? []).slice(-2).reverse();
  } catch {
    archives = [];
  }

  const months = [];
  for (const url of archives) {
    try {
      const month = await request(url).then((r) => r.json());
      months.push(...(month.games ?? []));
    } catch {
      /* skip a broken archive */
    }
  }

  const games = months
    .filter((game) => game.pgn && game.rules === 'chess')
    .sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
    .slice(0, 40)
    .map((game) => {
      const white = game.white?.username ?? 'White';
      const black = game.black?.username ?? 'Black';
      const result =
        game.white?.result === 'win' ? '1-0' : game.black?.result === 'win' ? '0-1' : '1/2-1/2';
      const playerColor = white.toLowerCase() === handle ? 'white' : 'black';
      return {
        id: game.uuid ?? game.url,
        source: 'chesscom',
        url: game.url,
        pgn: game.pgn,
        white,
        black,
        whiteElo: game.white?.rating ?? null,
        blackElo: game.black?.rating ?? null,
        result,
        outcome: friendlyResult(result, playerColor),
        playerColor,
        date: game.end_time ? new Date(game.end_time * 1000).toISOString() : null,
        timeClass: game.time_class ?? null,
        timeControl: game.time_control ?? null,
        rated: !!game.rated,
        opening: openingFromPgn(game.pgn) ?? game.eco?.split('/').pop()?.replace(/-/g, ' ') ?? null,
      };
    });

  const payload = {
    source: 'chesscom',
    player: {
      username: profile.username ?? username,
      name: profile.name ?? null,
      title: profile.title ?? null,
      avatar: profile.avatar ?? null,
      url: profile.url ?? `https://www.chess.com/member/${handle}`,
      country: profile.country ?? null,
      followers: profile.followers ?? null,
      joined: profile.joined ? new Date(profile.joined * 1000).toISOString() : null,
    },
    games,
  };
  cacheSet(cacheKey, payload);
  return payload;
}

export async function fetchLichessPlayer(username) {
  const handle = username.trim();
  if (!/^[\w-]{2,30}$/.test(handle)) throw new SourceError('That does not look like a Lichess username.', 400);
  const cacheKey = `lichess:${handle.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const profile = await request(`https://lichess.org/api/user/${encodeURIComponent(handle)}`).then((r) => r.json());
  const gamesResponse = await request(
    `https://lichess.org/api/games/user/${encodeURIComponent(handle)}?max=40&pgnInJson=true&clocks=false&evals=false&opening=true&sort=dateDesc`,
    { accept: 'application/x-ndjson' },
  );
  const text = await gamesResponse.text();

  const games = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((game) => game && game.pgn && (!game.variant || game.variant === 'standard'))
    .map((game) => mapLichessGame(game, handle));

  const payload = buildLichessPayload(profile, games, handle);
  cacheSet(cacheKey, payload);
  return payload;
}

/** Shape a single Lichess API game for the app (shared with the browser fallback). */
export function mapLichessGame(game, handle) {
  const white = game.players?.white?.user?.name ?? 'Anonymous';
  const black = game.players?.black?.user?.name ?? 'Anonymous';
  const result = game.winner === 'white' ? '1-0' : game.winner === 'black' ? '0-1' : '1/2-1/2';
  const playerColor =
    white.toLowerCase() === handle.toLowerCase() ? 'white' : black.toLowerCase() === handle.toLowerCase() ? 'black' : 'white';
  return {
    id: game.id,
    source: 'lichess',
    url: `https://lichess.org/${game.id}`,
    pgn: game.pgn,
    white,
    black,
    whiteElo: game.players?.white?.rating ?? null,
    blackElo: game.players?.black?.rating ?? null,
    result,
    outcome: friendlyResult(result, playerColor),
    playerColor,
    date: game.createdAt ? new Date(game.createdAt).toISOString() : dateFromPgn(game.pgn),
    timeClass: game.speed ?? null,
    timeControl: game.clock ? `${game.clock.initial}+${game.clock.increment}` : null,
    rated: !!game.rated,
    opening: game.opening?.name ?? openingFromPgn(game.pgn),
    status: game.status ?? null,
  };
}

const WEEK_MAX_GAMES = 20;

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function parseRange(fromDate, toDate) {
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${toDate}T23:59:59.999Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new SourceError('That date range does not look right.', 400);
  }
  if (end - start > 21 * 86_400_000) throw new SourceError('Weekly reports cover at most three weeks.', 400);
  return { start, end };
}

/** Chess.com game → the summary shape the app uses. */
function mapChesscomGame(game, handle) {
  const white = game.white?.username ?? 'White';
  const black = game.black?.username ?? 'Black';
  const result = game.white?.result === 'win' ? '1-0' : game.black?.result === 'win' ? '0-1' : '1/2-1/2';
  const playerColor = white.toLowerCase() === handle ? 'white' : 'black';
  return {
    id: game.uuid ?? game.url,
    source: 'chesscom',
    url: game.url,
    pgn: game.pgn,
    white,
    black,
    whiteElo: game.white?.rating ?? null,
    blackElo: game.black?.rating ?? null,
    result,
    outcome: friendlyResult(result, playerColor),
    playerColor,
    date: game.end_time ? new Date(game.end_time * 1000).toISOString() : null,
    timeClass: game.time_class ?? null,
    timeControl: game.time_control ?? null,
    rated: !!game.rated,
    opening: openingFromPgn(game.pgn) ?? game.eco?.split('/').pop()?.replace(/-/g, ' ') ?? null,
  };
}

/** Every Chess.com game that finished inside the range. */
export async function fetchChesscomWeek(username, fromDate, toDate) {
  const handle = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,40}$/.test(handle)) throw new SourceError('That does not look like a Chess.com username.', 400);
  const { start, end } = parseRange(fromDate, toDate);

  const months = [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  while (cursor.getTime() <= end && months.length < 4) {
    months.push(`${cursor.getUTCFullYear()}/${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  const games = [];
  for (const month of months) {
    let payload;
    try {
      payload = await request(`https://api.chess.com/pub/player/${handle}/games/${month}`).then((r) => r.json());
    } catch {
      continue;
    }
    for (const game of payload.games ?? []) {
      if (game.rules !== 'chess' || !game.pgn) continue;
      const finished = (game.end_time ?? 0) * 1000;
      if (finished < start || finished > end) continue;
      games.push(mapChesscomGame(game, handle));
    }
  }

  games.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const profile = await request(`https://api.chess.com/pub/player/${handle}`)
    .then((r) => r.json())
    .catch(() => null);

  return {
    source: 'chesscom',
    player: {
      username: profile?.username ?? handle,
      name: profile?.name ?? null,
      avatar: profile?.avatar ?? null,
      country: profile?.country ?? null,
      url: profile?.url ?? `https://www.chess.com/member/${handle}`,
    },
    from: isoDay(new Date(start)),
    to: isoDay(new Date(end)),
    games: games.slice(0, WEEK_MAX_GAMES),
    found: games.length,
    truncated: games.length > WEEK_MAX_GAMES,
  };
}

/** Every Lichess game inside the range, oldest first. */
export async function fetchLichessWeek(username, fromDate, toDate) {
  const handle = username.trim();
  if (!/^[\w-]{2,30}$/.test(handle)) throw new SourceError('That does not look like a Lichess username.', 400);
  const { start, end } = parseRange(fromDate, toDate);

  const gamesResponse = await request(
    `https://lichess.org/api/games/user/${encodeURIComponent(handle)}?since=${start}&until=${end}&max=${WEEK_MAX_GAMES}&pgnInJson=true&clocks=false&evals=false&opening=true&sort=dateAsc`,
    { accept: 'application/x-ndjson' },
  );
  const text = await gamesResponse.text();
  const games = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter((game) => game && game.pgn && (!game.variant || game.variant === 'standard'))
    .map((game) => mapLichessGame(game, handle));

  const profile = await request(`https://lichess.org/api/user/${encodeURIComponent(handle)}`)
    .then((r) => r.json())
    .catch(() => null);

  return {
    source: 'lichess',
    player: {
      username: profile?.username ?? handle,
      name: profile?.profile?.realName ?? null,
      avatar: null,
      country: profile?.profile?.country ?? null,
      url: profile?.url ?? `https://lichess.org/@/${handle}`,
    },
    from: isoDay(new Date(start)),
    to: isoDay(new Date(end)),
    games,
    found: games.length,
    truncated: false,
  };
}

export function buildLichessPayload(profile, games, handle) {
  return {
    source: 'lichess',
    player: {
      username: profile.username ?? handle,
      name: profile.profile?.realName ?? null,
      title: profile.title ?? null,
      avatar: null,
      url: profile.url ?? `https://lichess.org/@/${handle}`,
      country: profile.profile?.country ?? null,
      followers: profile.followers ?? null,
      joined: profile.createdAt ? new Date(profile.createdAt).toISOString() : null,
      ratings: {
        bullet: profile.perfs?.bullet?.rating ?? null,
        blitz: profile.perfs?.blitz?.rating ?? null,
        rapid: profile.perfs?.rapid?.rating ?? null,
        classical: profile.perfs?.classical?.rating ?? null,
      },
    },
    games,
  };
}
