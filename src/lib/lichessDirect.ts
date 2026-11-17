import { buildLichessPayload, mapLichessGame } from '../../server/sources.mjs';
import type { PlayerPayload, WeekPayload } from '../types';

const build = buildLichessPayload as unknown as (
  profile: Record<string, unknown>,
  games: unknown[],
  handle: string,
) => PlayerPayload;
const mapGame = mapLichessGame as unknown as (game: Record<string, unknown>, handle: string) => PlayerPayload['games'][number];

/**
 * Some hosting egress ranges are rate-limited by Lichess. The browser is not,
 * and Lichess sends `Access-Control-Allow-Origin: *`, so fetch there instead.
 */
export async function fetchLichessDirect(username: string): Promise<PlayerPayload> {
  const handle = username.trim();
  const profileResponse = await fetch(`https://lichess.org/api/user/${encodeURIComponent(handle)}`, {
    headers: { Accept: 'application/json' },
  });
  if (profileResponse.status === 404) throw new Error('No player with that username was found.');
  if (!profileResponse.ok) throw new Error(`Lichess responded with ${profileResponse.status}.`);
  const profile = await profileResponse.json();

  const gamesResponse = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(handle)}?max=40&pgnInJson=true&clocks=false&evals=false&opening=true&sort=dateDesc`,
    { headers: { Accept: 'application/x-ndjson' } },
  );
  if (!gamesResponse.ok) throw new Error(`Lichess responded with ${gamesResponse.status}.`);
  const text = await gamesResponse.text();

  const games = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((game): game is Record<string, unknown> => !!game && !!game.pgn && (!game.variant || game.variant === 'standard'))
    .map((game) => mapGame(game, handle));

  return build(profile, games, handle);
}

/** Same week endpoint as the Worker, fetched from the browser when egress is throttled. */
export async function fetchLichessWeekDirect(username: string, from: string, to: string): Promise<WeekPayload> {
  const handle = username.trim();
  const since = Date.parse(`${from}T00:00:00Z`);
  const until = Date.parse(`${to}T23:59:59.999Z`);

  const gamesResponse = await fetch(
    `https://lichess.org/api/games/user/${encodeURIComponent(
      handle,
    )}?since=${since}&until=${until}&max=20&pgnInJson=true&clocks=false&evals=false&opening=true&sort=dateAsc`,
    { headers: { Accept: 'application/x-ndjson' } },
  );
  if (gamesResponse.status === 404) throw new Error('No player with that username was found.');
  if (!gamesResponse.ok) throw new Error(`Lichess responded with ${gamesResponse.status}.`);
  const text = await gamesResponse.text();
  const games = text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((game): game is Record<string, unknown> => !!game && !!game.pgn && (!game.variant || game.variant === 'standard'))
    .map((game) => mapGame(game, handle));

  const profileResponse = await fetch(`https://lichess.org/api/user/${encodeURIComponent(handle)}`, {
    headers: { Accept: 'application/json' },
  });
  const profile = profileResponse.ok ? await profileResponse.json() : {};

  return {
    source: 'lichess',
    player: {
      username: (profile as { username?: string }).username ?? handle,
      name: (profile as { profile?: { realName?: string } }).profile?.realName ?? null,
      avatar: null,
      country: (profile as { profile?: { country?: string } }).profile?.country ?? null,
      url: (profile as { url?: string }).url ?? `https://lichess.org/@/${handle}`,
    },
    from,
    to,
    games,
    found: games.length,
    truncated: false,
  };
}
