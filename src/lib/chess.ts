import type { Classification, Color } from '../types';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const PIECE_LETTERS: Record<string, string> = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' };

/** FEN board → 64 squares in visual order (rank 8 first), null for empty. */
export function boardFromFen(fen: string): (string | null)[] {
  const rank = fen.split(' ')[0];
  const squares: (string | null)[] = [];
  for (const row of rank.split('/')) {
    for (const char of row) {
      if (/\d/.test(char)) {
        for (let i = 0; i < Number(char); i++) squares.push(null);
      } else {
        squares.push(char);
      }
    }
  }
  while (squares.length < 64) squares.push(null);
  return squares;
}

export function pieceImage(piece: string): string {
  const isWhite = piece === piece.toUpperCase();
  // BASE_URL keeps public assets working when the app is served from a
  // sub-path, as GitHub Pages project sites are.
  return `${import.meta.env.BASE_URL}pieces/${isWhite ? 'w' : 'b'}${PIECE_LETTERS[piece.toLowerCase()]}.svg`;
}

export function squareName(index: number, flipped: boolean): string {
  const row = flipped ? 7 - Math.floor(index / 8) : Math.floor(index / 8);
  const col = flipped ? 7 - (index % 8) : index % 8;
  return `${FILES[col]}${8 - row}`;
}

export function squareToPoint(square: string, flipped: boolean): { x: number; y: number } {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]) - 1;
  const col = flipped ? 7 - file : file;
  const row = flipped ? rank : 7 - rank;
  return { x: (col + 0.5) * 12.5, y: (row + 0.5) * 12.5 };
}

export function uciToSquares(uci: string | null): { from: string; to: string } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

export function formatEval(cp: number | null, mate: number | null, color: Color = 'w'): string {
  if (mate != null) {
    const pov = color === 'w' ? mate : -mate;
    return `${pov > 0 ? '#' : '-#'}${Math.abs(pov)}`;
  }
  if (cp == null) return '0.0';
  const pov = (color === 'w' ? cp : -cp) / 100;
  return `${pov > 0 ? '+' : ''}${pov.toFixed(1)}`;
}

export function winPercent(cp: number | null, mate: number | null): number {
  if (mate != null) return mate > 0 ? 100 : 0;
  if (cp == null) return 50;
  if (cp >= 6000) return 100;
  if (cp <= -6000) return 0;
  const capped = Math.max(-1000, Math.min(1000, cp));
  return (1 / (1 + Math.exp(-0.00368208 * capped))) * 100;
}

export const CLASSIFICATION_META: Record<
  Classification,
  { label: string; short: string; tone: string }
> = {
  brilliant: { label: 'Brilliant', short: '!!', tone: 'brilliant' },
  great: { label: 'Great', short: '!', tone: 'great' },
  best: { label: 'Best', short: '★', tone: 'best' },
  excellent: { label: 'Excellent', short: '✓', tone: 'excellent' },
  good: { label: 'Good', short: '·', tone: 'good' },
  inaccuracy: { label: 'Inaccuracy', short: '?!', tone: 'inaccuracy' },
  mistake: { label: 'Mistake', short: '?', tone: 'mistake' },
  blunder: { label: 'Blunder', short: '??', tone: 'blunder' },
  forced: { label: 'Forced', short: '→', tone: 'forced' },
};

export function formatDate(value: string | null): string {
  if (!value) return 'Unknown date';
  const parsed = new Date(value.length <= 10 ? `${value.replace(/\./g, '-')}T12:00:00Z` : value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function relativeDay(value: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const days = Math.round((Date.now() - parsed.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

export function outcomeLabel(outcome: string): string {
  switch (outcome) {
    case 'win':
      return 'Win';
    case 'loss':
      return 'Loss';
    case 'draw':
      return 'Draw';
    case 'imported':
      return 'Imported';
    default:
      return 'Game';
  }
}

export function timeControlLabel(game: { timeClass?: string | null; timeControl?: string | null }): string {
  if (game.timeClass) return game.timeClass.replace(/^./, (c) => c.toUpperCase());
  if (game.timeControl && /^\d+\+\d+$/.test(game.timeControl)) return game.timeControl;
  return game.timeControl ?? 'Standard';
}

export function playerRating(elo: number | string | null | undefined): string {
  return elo == null || elo === '' ? '—' : String(elo);
}

export function accuracyTone(accuracy: number): string {
  if (accuracy >= 90) return 'excellent';
  if (accuracy >= 80) return 'good';
  if (accuracy >= 70) return 'inaccuracy';
  if (accuracy >= 55) return 'mistake';
  return 'blunder';
}
