import { buildWeeklyReport } from '../../server/weekly.mjs';
import type { WeeklyReport, WeekPayload } from '../types';
import { apiUrl } from './http';
import { runLocalReview } from './localReview';

const build = buildWeeklyReport as unknown as (args: {
  username: string;
  platform: 'chesscom' | 'lichess';
  from: string;
  to: string;
  depth: number;
  entries: { summary: WeekPayload['games'][number]; report: unknown }[];
}) => WeeklyReport;

export const WEEK_MAX_GAMES = 12;
// Weekly reviews cover a lot of positions, so each one gets a tight clock.
const WEEK_MOVETIME = 200;

export interface WeekProgress {
  stage: 'fetching' | 'reviewing';
  gameIndex: number;
  gameCount: number;
  position: number;
  positions: number;
  label: string;
}

export async function loadWeek(
  source: 'chesscom' | 'lichess',
  username: string,
  from: string,
  to: string,
): Promise<WeekPayload> {
  const url = apiUrl(`/api/week/${source}/${encodeURIComponent(username)}?from=${from}&to=${to}`);
  const response = await fetch(url);
  if (response.ok) return (await response.json()) as WeekPayload;

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (source === 'lichess' && response.status !== 404) {
    const { fetchLichessWeekDirect } = await import('./lichessDirect');
    return fetchLichessWeekDirect(username, from, to);
  }
  throw new Error(body.error ?? `Request failed (${response.status})`);
}

export async function runWeeklyReport({
  source,
  username,
  from,
  to,
  depth = 12,
  onProgress,
}: {
  source: 'chesscom' | 'lichess';
  username: string;
  from: string;
  to: string;
  depth?: number;
  onProgress: (progress: WeekProgress) => void;
}): Promise<{ report: WeeklyReport; payload: WeekPayload }> {
  onProgress({ stage: 'fetching', gameIndex: 0, gameCount: 0, position: 0, positions: 0, label: 'Collecting games from the week…' });
  const payload = await loadWeek(source, username, from, to);
  const games = payload.games.slice(0, WEEK_MAX_GAMES);

  if (!games.length) {
    throw new Error('No finished standard games found for that week. Try another week or platform.');
  }

  const entries: { summary: WeekPayload['games'][number]; report: unknown }[] = [];
  for (let index = 0; index < games.length; index++) {
    const game = games[index];
    onProgress({
      stage: 'reviewing',
      gameIndex: index + 1,
      gameCount: games.length,
      position: 0,
      positions: 0,
      label: `Reviewing ${game.white} vs ${game.black}`,
    });
    const report = await runLocalReview({
      pgn: game.pgn,
      depth,
      movetime: WEEK_MOVETIME,
      onProgress: async (position, positions) => {
        onProgress({
          stage: 'reviewing',
          gameIndex: index + 1,
          gameCount: games.length,
          position,
          positions,
          label: `Reviewing ${game.white} vs ${game.black}`,
        });
      },
    });
    entries.push({ summary: game, report });
  }

  const report = build({
    username: payload.player.username,
    platform: source,
    from: payload.from,
    to: payload.to,
    depth,
    entries,
  });

  const byId = new Map(games.map((game) => [game.id, game]));
  report.games = report.games.map((game) => ({ ...game, summary: byId.get(game.id) }));

  return { report, payload };
}
