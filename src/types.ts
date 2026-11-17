export type Source = 'chesscom' | 'lichess' | 'pgn';
export type Color = 'w' | 'b';

export interface GameSummary {
  id: string;
  source: Source;
  url: string | null;
  pgn: string;
  white: string;
  black: string;
  whiteElo: number | string | null;
  blackElo: number | string | null;
  result: string;
  outcome: string;
  playerColor: 'white' | 'black' | null;
  date: string | null;
  timeClass: string | null;
  timeControl: string | null;
  rated: boolean | null;
  opening: string | null;
}

export interface PlayerInfo {
  username: string;
  name: string | null;
  title: string | null;
  avatar: string | null;
  url: string;
  country: string | null;
  followers?: number | null;
  joined: string | null;
  ratings?: {
    bullet: number | null;
    blitz: number | null;
    rapid: number | null;
    classical: number | null;
  };
}

export interface PlayerPayload {
  source: 'chesscom' | 'lichess';
  player: PlayerInfo;
  games: GameSummary[];
}

export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | 'forced';

export type Mood = 'proud' | 'happy' | 'neutral' | 'thinking' | 'worried' | 'alarmed';

export interface CoachLine {
  title: string;
  body: string;
  mood: Mood;
}

export interface ReviewedMove {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  isCheck: boolean;
  isCapture: boolean;
  isCastle: boolean;
  isPromotion: boolean;
  phase: 'opening' | 'middlegame' | 'endgame';
  opening: string | null;
  classification: Classification;
  rank: number;
  tags: string[];
  loss: number;
  accuracy: number;
  evalCpBefore: number;
  evalCpAfter: number;
  mateBefore: number | null;
  mateAfter: number | null;
  wpBefore: number;
  wpAfter: number;
  bestSan: string | null;
  bestUci: string | null;
  bestLine: string[];
  secondSan: string | null;
  secondEval: number | null;
  bestEval: number | null;
  reply: { san: string | null; piece: string } | null;
  sacrifice: number;
  coach: CoachLine;
}

export interface Counts {
  brilliant: number;
  great: number;
  best: number;
  excellent: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  forced: number;
  missedWin: number;
  missedMate: number;
}

export interface Takeaway {
  title: string;
  body: string;
}

export interface PlayerSummary {
  headline: string;
  grade: string;
  mood: Mood;
  accuracy: number;
  takeaways: Takeaway[];
  turningPoint: string;
  intro: string;
  resultLine: string;
}

export interface PlayerReport {
  name: string;
  elo: number | string | null;
  accuracy: number;
  accuracyByPhase: Partial<Record<'opening' | 'middlegame' | 'endgame', number>>;
  counts: Counts;
  grade: string;
  summary: PlayerSummary;
}

export interface ReviewMeta {
  white: string;
  black: string;
  whiteElo: number | string | null;
  blackElo: number | string | null;
  result: string;
  date: string | null;
  event: string | null;
  site: string | null;
  timeControl: string | null;
  termination: string | null;
  opening: string | null;
  eco: string | null;
  startFen: string;
  totalPlies: number;
}

export interface Review {
  engine: { name: string; depth: number };
  meta: ReviewMeta;
  moves: ReviewedMove[];
  players: { w: PlayerReport; b: PlayerReport };
  keyMoments: number[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface WeekPayload {
  source: 'chesscom' | 'lichess';
  player: {
    username: string;
    name: string | null;
    avatar: string | null;
    country: string | null;
    url: string;
  };
  from: string;
  to: string;
  games: GameSummary[];
  found: number;
  truncated: boolean;
}

export type WeekResult = 'win' | 'loss' | 'draw' | 'unfinished';

export interface WeeklyGame {
  id: string;
  color: Color;
  opponent: string;
  opponentElo: number | string | null;
  result: WeekResult;
  accuracy: number;
  grade: string;
  opening: string;
  date: string | null;
  url: string | null;
  peakWin: number;
  summary?: GameSummary;
}

export interface WeeklyMistake {
  san: string;
  moveNumber: number;
  classification: Classification;
  loss: number;
  bestSan: string | null;
  coach: string | null;
  gameId: string;
  opponent: string;
  result: WeekResult;
  color: Color;
  opening: string;
}

export interface WeeklyReport {
  player: string;
  platform: 'chesscom' | 'lichess';
  from: string;
  to: string;
  depth: number;
  generatedAt: string;
  games: WeeklyGame[];
  totals: {
    games: number;
    finished: number;
    moves: number;
    record: { win: number; loss: number; draw: number };
    score: number;
    resultRate: number;
    accuracy: number;
    accuracyByPhase: Partial<Record<'opening' | 'middlegame' | 'endgame', number>>;
    counts: Counts;
    blundersPerGame: number;
  };
  grade: string;
  headline: string;
  summary: string;
  focus: { title: string; body: string; metric: string }[];
  strengths: string[];
  mistakes: WeeklyMistake[];
  openings: { name: string; games: number; score: number; accuracy: number }[];
  colorSplit: { white: { games: number; accuracy: number }; black: { games: number; accuracy: number } };
  bestGame: { id: string; opponent: string; accuracy: number; result: WeekResult; opening: string; date: string | null } | null;
  worstGame: { id: string; opponent: string; accuracy: number; result: WeekResult; opening: string; date: string | null } | null;
}

export interface ReviewSession {
  game: GameSummary;
  depth: number;
  jobId?: string;
  progress?: { done: number; total: number; message?: string };
  report?: Review;
  error?: string;
}
