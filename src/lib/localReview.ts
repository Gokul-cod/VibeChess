import { reviewGame } from '../../server/review.mjs';
import type { Review } from '../types';
import { WebEngine } from './webEngine';

interface LocalReviewArgs {
  pgn: string;
  depth: number;
  /** Optional per-position clock, used by the weekly report to keep things moving. */
  movetime?: number;
  onProgress: (done: number, total: number) => void | Promise<void>;
}

const runReview = reviewGame as unknown as (args: {
  pgn: string;
  depth: number;
  movetime: number;
  engine: WebEngine;
  onProgress: (done: number, total: number) => Promise<void>;
}) => Promise<Review>;

// Depth requests stay the same, but each position gets a clock so long searches
// cannot stall a whole game on a single sharp position.
const TIME_BUDGET: Record<number, number> = { 15: 1200, 18: 3000, 21: 6000 };

let instance: WebEngine | null = null;
let loading: Promise<WebEngine> | null = null;

function getEngine(): Promise<WebEngine> {
  if (!loading) {
    instance = new WebEngine();
    loading = instance.start().catch((error) => {
      instance = null;
      loading = null;
      throw error;
    });
  }
  return loading;
}

/** Download + warm the WASM engine so the first review is not waiting on it. */
export function warmUpWebEngine() {
  void getEngine().catch(() => undefined);
}

export async function runLocalReview({ pgn, depth, movetime, onProgress }: LocalReviewArgs): Promise<Review> {
  const engine = await getEngine();
  return runReview({
    pgn,
    depth,
    movetime: movetime ?? TIME_BUDGET[depth] ?? 500,
    engine,
    onProgress: async (done, total) => {
      await onProgress(done, total);
    },
  });
}

/** Stop a running review (the next one starts a fresh worker). */
export function cancelLocalReview() {
  instance?.terminate();
  instance = null;
  loading = null;
}
