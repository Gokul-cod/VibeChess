import type { GameSummary, PlayerPayload, Review, Source } from '../types';
import { apiUrl } from './http';

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error ?? `Request failed (${response.status})`);
  }
  return body as T;
}

export async function loadPlayer(source: Exclude<Source, 'pgn'>, username: string): Promise<PlayerPayload> {
  const response = await fetch(apiUrl(`/api/players/${source}/${encodeURIComponent(username)}`));
  if (response.ok) return json<PlayerPayload>(response);

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  // Hosted egress ranges are sometimes rate-limited by Lichess; the browser is not.
  if (source === 'lichess' && response.status !== 404) {
    try {
      const { fetchLichessDirect } = await import('./lichessDirect');
      return await fetchLichessDirect(username);
    } catch (fallbackError) {
      throw new Error((fallbackError as Error).message ?? body.error ?? `Request failed (${response.status})`);
    }
  }
  throw new Error(body.error ?? `Request failed (${response.status})`);
}

export async function previewPgn(pgn: string): Promise<GameSummary[]> {
  const response = await fetch(apiUrl('/api/pgn/preview'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pgn }),
  });
  const data = await json<{ games: GameSummary[] }>(response);
  return data.games;
}

export async function startReview(pgn: string, depth: number): Promise<{ jobId: string; cached?: boolean }> {
  const response = await fetch(apiUrl('/api/review'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pgn, depth }),
  });
  return json<{ jobId: string; cached?: boolean }>(response);
}

export type ReviewEvent =
  | { type: 'progress'; done: number; total: number; message?: string }
  | { type: 'done'; report: Review; cached?: boolean }
  | { type: 'error'; message: string };

/** Subscribe to review progress. Returns an unsubscribe function. */
export function streamReview(jobId: string, onEvent: (event: ReviewEvent) => void): () => void {
  const source = new EventSource(apiUrl(`/api/review/${jobId}/stream`));
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    source.close();
  };

  source.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as ReviewEvent;
      onEvent(event);
      if (event.type === 'done' || event.type === 'error') close();
    } catch {
      /* ignore malformed frames */
    }
  };
  source.onerror = () => {
    // The server closes the stream once it sends `done`; that surfaces as an error.
    if (source.readyState === EventSource.CLOSED) close();
  };

  return close;
}

export async function fetchHealth(): Promise<{ ok: boolean; engine: { name: string; ready: boolean } | null }> {
  const response = await fetch(apiUrl('/api/health'));
  return json(response);
}
