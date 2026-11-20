/**
 * Concrete position facts used to write the review commentary.
 * Everything here is measured from the actual board and engine lines — no
 * generic advice is invented without a fact behind it.
 */
import { Chess } from 'chess.js';

export const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

const OTHER = { w: 'b', b: 'w' };

function boardOf(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

/** Signed material for `color`, in centipawns. */
export function materialBalance(fen, color) {
  const board = fen.split(' ')[0];
  let white = 0;
  let black = 0;
  for (const char of board) {
    const lower = char.toLowerCase();
    if (!(lower in PIECE_VALUE) || lower === 'k') continue;
    if (char === char.toUpperCase()) white += PIECE_VALUE[lower];
    else black += PIECE_VALUE[lower];
  }
  return color === 'w' ? white - black : black - white;
}

function playPv(chess, pv, limit) {
  for (let i = 0; i < Math.min(limit, pv?.length ?? 0); i++) {
    const uci = pv[i];
    if (!uci || uci.length < 4) break;
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
    } catch {
      break;
    }
  }
}

/**
 * Material for `color` after following the given engine line (default 4 plies).
 * Positive means the line wins material, negative means it gives material up.
 */
export function lineMaterial(fen, pv, color, plies = 4) {
  const chess = boardOf(fen);
  if (!chess) return 0;
  const before = materialBalance(chess.fen(), color);
  playPv(chess, pv, plies);
  return materialBalance(chess.fen(), color) - before;
}

/** Material for `color` right after playing a single UCI move. */
export function materialAfterMove(fen, uci, color) {
  return lineMaterial(fen, [uci], color, 1);
}

/**
 * Pieces of `color` that are under-defended right now: attacked by more pieces
 * than defend them, or by something cheaper than they are. These are the pieces
 * that actually get won, so they are worth naming in the commentary.
 */
export function loosePieces(fen, color) {
  const chess = boardOf(fen);
  if (!chess) return [];
  const foe = OTHER[color];
  const found = [];
  for (const square of chess.board().flat()) {
    if (!square || square.color !== color) continue;
    const value = PIECE_VALUE[square.type];
    if (value < 300) continue;
    let attackers = [];
    let defenders = [];
    try {
      attackers = chess.attackers(square.square, foe);
      defenders = chess.attackers(square.square, color);
    } catch {
      continue;
    }
    if (!attackers.length) continue;
    const cheapest = Math.min(
      ...attackers.map((from) => PIECE_VALUE[chess.get(from)?.type] ?? 100),
    );
    if (defenders.length === 0 || cheapest < value || attackers.length > defenders.length) {
      found.push({
        square: square.square,
        type: square.type,
        value,
        attackers: attackers.length,
        defenders: defenders.length,
      });
    }
  }
  return found.sort((a, b) => b.value - a.value);
}

/**
 * Enemy pieces that the mover can win on the spot: attacked, and either
 * undefended or attacked by something cheaper.
 */
export function hangingTargets(fen, color) {
  const chess = boardOf(fen);
  if (!chess) return [];
  const foe = OTHER[color];
  const found = [];
  for (const square of chess.board().flat()) {
    if (!square || square.color !== foe) continue;
    const value = PIECE_VALUE[square.type];
    if (value < 300) continue;
    let attackers = [];
    let defenders = [];
    try {
      attackers = chess.attackers(square.square, color);
      defenders = chess.attackers(square.square, foe);
    } catch {
      continue;
    }
    if (!attackers.length) continue;
    const cheapest = Math.min(
      ...attackers.map((from) => PIECE_VALUE[chess.get(from)?.type] ?? 100),
    );
    if (defenders.length === 0 || cheapest < value || attackers.length > defenders.length) {
      found.push({ square: square.square, type: square.type, value, attackers: attackers.length, defenders: defenders.length });
    }
  }
  return found.sort((a, b) => b.value - a.value);
}

/** Enemy pieces newly won by playing `uci` in `fen` (attacked before, not after). */
export function newTargets(fen, uci, color) {
  if (!uci) return [];
  const chess = boardOf(fen);
  if (!chess) return [];
  const before = new Set(hangingTargets(chess.fen(), color).map((piece) => piece.square));
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  } catch {
    return [];
  }
  return hangingTargets(chess.fen(), color).filter((piece) => !before.has(piece.square));
}

/** Is the position after `fen + uci` check? */
export function moveGivesCheck(fen, uci) {
  const chess = boardOf(fen);
  if (!chess || !uci) return false;
  try {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return chess.isCheck();
  } catch {
    return false;
  }
}

/** Is `uci` a capture in `fen`? */
export function isCapture(fen, uci) {
  const chess = boardOf(fen);
  if (!chess || !uci) return false;
  const target = uci.slice(2, 4);
  return !!chess.get(target);
}
