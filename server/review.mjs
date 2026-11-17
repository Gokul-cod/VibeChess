import { Chess } from 'chess.js';
import { moveCoach, buildSummary } from './coach.mjs';
import { splitGames, parsePgnHeaders, DEPTHS, MAX_PLIES } from './pgn.mjs';

export { splitGames, parsePgnHeaders, DEPTHS, MAX_PLIES };

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

function stripAnnotations(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/;[^\n]*/g, ' ')
    .replace(/\(\s*[^()]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Parse one PGN game into headers plus a list of moves with board snapshots. */
export function parseGame(pgn) {
  const text = pgn.trim();
  const headers = parsePgnHeaders(text);
  const chess = new Chess();
  let loaded = false;
  if (/\[Variant\s+"(Chess960|Atomic|Horde|Racing Kings|Crazyhouse|Antichess|Three-check|King of the Hill)"\]/i.test(text)) {
    throw new Error('Only standard chess games can be reviewed.');
  }
  try {
    chess.loadPgn(text);
    loaded = true;
  } catch {
    try {
      chess.loadPgn(stripAnnotations(text));
      loaded = true;
    } catch (error) {
      throw new Error('That game could not be read as valid PGN.');
    }
  }
  if (!loaded) throw new Error('That game could not be read as valid PGN.');

  const verbose = chess.history({ verbose: true });
  if (!verbose.length) throw new Error('That PGN does not contain any moves.');

  const moves = verbose.map((move, index) => {
    const fenBefore = move.before;
    const parts = fenBefore.split(' ');
    return {
      ply: index + 1,
      moveNumber: Number(parts[5] ?? Math.floor(index / 2) + 1),
      color: move.color,
      san: move.san,
      uci: move.lan ?? `${move.from}${move.to}${move.promotion ?? ''}`,
      fenBefore,
      fenAfter: move.after,
      piece: move.piece,
      captured: move.captured ?? null,
      isCastle: move.san === 'O-O' || move.san === 'O-O-O',
      isCheck: move.san.includes('+') || move.san.includes('#'),
      isPromotion: !!move.promotion,
    };
  });

  return {
    headers,
    startFen: moves[0]?.fenBefore ?? START_FEN,
    moves,
  };
}

function squareColor(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 0 ? 'dark' : 'light';
}

function material(fen) {
  const board = fen.split(' ')[0];
  let white = 0;
  let black = 0;
  for (const char of board) {
    const lower = char.toLowerCase();
    if (!(lower in PIECE_VALUE) || lower === 'k') continue;
    if (char === char.toUpperCase()) white += PIECE_VALUE[lower];
    else black += PIECE_VALUE[lower];
  }
  return { white, black, total: white + black };
}

export function scoreToCp(line) {
  if (!line) return 0;
  if (line.mate != null) return line.mate > 0 ? 10000 - Math.abs(line.mate) * 10 : -10000 + Math.abs(line.mate) * 10;
  return line.cp ?? 0;
}

function winProbability(cpWhite) {
  if (cpWhite >= 6000) return 0.999;
  if (cpWhite <= -6000) return 0.001;
  const capped = Math.max(-1000, Math.min(1000, cpWhite));
  return 1 / (1 + Math.exp(-0.00368208 * capped));
}

function uciToSan(fen, uci) {
  if (!uci || uci.length < 4) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return move?.san ?? null;
  } catch {
    return null;
  }
}

function pvToSan(fen, pv, limit = 5) {
  const chess = new Chess(fen);
  const sans = [];
  for (const uci of (pv ?? []).slice(0, limit)) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!move) break;
      sans.push(move.san);
    } catch {
      break;
    }
  }
  return sans;
}

function findCapturedPiece(fen, uci) {
  const chess = new Chess(fen);
  const target = uci?.slice(2, 4);
  if (!target) return null;
  const piece = chess.get(target);
  return piece ? piece.type : null;
}

/** Score for a position where the engine has no line (checkmate / stalemate). */
function terminalEval(fen) {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) return chess.turn() === 'w' ? -10000 : 10000;
    return 0;
  } catch {
    return 0;
  }
}

function phaseFor(moveIndex, fen, totalMoves) {
  if (moveIndex < 20) return 'opening';
  const { total } = material(fen);
  if (total <= 2400) return 'endgame';
  return 'middlegame';
}

function classifyMove(context) {
  const { playedUci, bestUci, lines, wpBeforeMover, wpAfterMover, loss, sacrifice, legalMoves } = context;

  const isBest = !!bestUci && playedUci === bestUci;
  const rank = lines.findIndex((line) => line.pv[0] === playedUci) + 1;
  const bestGap =
    lines.length > 1
      ? Math.abs(scoreToCp(lines[0]) - scoreToCp(lines[1]))
      : 0;
  const isOnlyMove = bestGap >= 250 && lines.length > 1;

  if (legalMoves <= 1) return { classification: 'forced', isBest: false, rank, tags: [] };

  const tags = [];
  if (wpBeforeMover >= 0.82 && wpAfterMover <= 0.6) tags.push('missedWin');

  if (sacrifice >= 250 && wpAfterMover >= 0.55 && (isBest || rank === 2)) {
    tags.push('sacrifice');
    return { classification: 'brilliant', isBest, rank, tags };
  }
  if (isBest && isOnlyMove && wpBeforeMover > 0.15 && wpBeforeMover < 0.85) {
    return { classification: 'great', isBest, rank, tags };
  }
  if (loss >= 18) return { classification: 'blunder', isBest, rank, tags };
  if (loss >= 9) return { classification: 'mistake', isBest, rank, tags };
  if (loss >= 3.5) return { classification: 'inaccuracy', isBest, rank, tags };
  if (isBest) return { classification: 'best', isBest, rank, tags };
  if (loss < 1.5 && rank <= 2) return { classification: 'excellent', isBest, rank, tags };
  return { classification: 'good', isBest, rank, tags };
}

function accuracyFor(wpBeforeMover, wpAfterMover) {
  const before = wpBeforeMover * 100;
  const after = wpAfterMover * 100;
  if (after >= before) return 100;
  const value = 103.1668 * Math.exp(-0.04354 * (before - after)) - 3.1669;
  return Math.max(0, Math.min(100, value));
}

function openingFromHeaders(headers) {
  if (headers.Opening) return headers.Opening;
  if (headers.ECOUrl) {
    const slug = decodeURIComponent(headers.ECOUrl.split('/').filter(Boolean).pop() ?? '');
    return slug.replace(/-/g, ' ').replace(/\s+\d{4}\.\d{2}\.\d{2}.*$/, '').trim() || null;
  }
  return null;
}

function emptyCounts() {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    forced: 0,
    missedWin: 0,
    missedMate: 0,
  };
}

/**
 * Full game review. `onProgress(done, total)` is awaited so the HTTP layer can stream progress.
 */
export async function reviewGame({ pgn, depth = DEPTHS.balanced, movetime = 0, engine, onProgress = async () => {} }) {
  const { headers, moves, startFen } = parseGame(pgn);
  if (moves.length > MAX_PLIES) throw new Error(`That game is too long to review (${moves.length} plies, max ${MAX_PLIES}).`);

  const positions = [startFen, ...moves.map((move) => move.fenAfter)];
  const analyses = [];
  await onProgress(0, positions.length);
  for (let i = 0; i < positions.length; i++) {
    const analysis = await engine.analyze(positions[i], { depth, multipv: 2, movetime });
    analyses.push(analysis);
    await onProgress(i + 1, positions.length);
  }

  const opening = openingFromHeaders(headers);
  const reviewedMoves = [];
  const players = {
    w: { name: headers.White ?? 'White', elo: headers.WhiteElo ?? null, counts: emptyCounts(), accuracies: [], phases: {} },
    b: { name: headers.Black ?? 'Black', elo: headers.BlackElo ?? null, counts: emptyCounts(), accuracies: [], phases: {} },
  };

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const before = analyses[i];
    const after = analyses[i + 1];
    const turn = move.color;
    const sign = turn === 'w' ? 1 : -1;

    const bestLine = before?.lines?.[0] ?? null;
    const secondLine = before?.lines?.[1] ?? null;
    const afterLine = after?.lines?.[0] ?? null;

    // Stockfish scores are from the side-to-move's point of view. The side to move
    // flips after the played move, so the two positions need opposite signs to be
    // compared. Everything downstream is stored from White's point of view.
    const afterSideSign = turn === 'w' ? -1 : 1;
    const evalCpBefore = bestLine ? scoreToCp({ cp: bestLine.cp, mate: bestLine.mate }) * sign : 0;
    const evalCpAfter = afterLine
      ? scoreToCp({ cp: afterLine.cp, mate: afterLine.mate }) * afterSideSign
      : terminalEval(move.fenAfter);
    const mateBefore = bestLine?.mate != null ? bestLine.mate * sign : null;
    const mateAfter = afterLine?.mate != null ? afterLine.mate * afterSideSign : null;

    const wpBeforeWhite = winProbability(evalCpBefore);
    const wpAfterWhite = winProbability(evalCpAfter);
    const wpBeforeMover = turn === 'w' ? wpBeforeWhite : 1 - wpBeforeWhite;
    const wpAfterMover = turn === 'w' ? wpAfterWhite : 1 - wpAfterWhite;
    // A move that stays winning (or stays lost) costs less than the raw win%
    // delta suggests: +10.1 to +3.4 is still a won game, not a blunder.
    const moverEvalBefore = evalCpBefore * sign;
    const moverEvalAfter = evalCpAfter * sign;
    const sameSideDominant =
      (moverEvalBefore >= 300 && moverEvalAfter >= 300) || (moverEvalBefore <= -300 && moverEvalAfter <= -300);
    const mateBothSides =
      mateBefore != null && mateAfter != null && Math.sign(mateBefore) === Math.sign(mateAfter) && Math.sign(mateBefore) * sign > 0;
    const lossScale = mateBothSides ? 0.15 : sameSideDominant ? 0.35 : 1;
    const loss = Math.max(0, (wpBeforeMover - wpAfterMover) * 100 * lossScale);
    const wpAfterEffective = wpBeforeMover - loss / 100;

    // The opponent's best answer. If it wins material and we are still fine,
    // then the move we just played was a sacrifice.
    const opponentReply = after?.lines?.[0]?.pv?.[0] ?? null;
    const replyPiece = opponentReply ? findCapturedPiece(move.fenAfter, opponentReply) : null;
    const replyGain = (() => {
      if (!opponentReply || !replyPiece) return 0;
      const beforeReply = material(move.fenAfter);
      try {
        const chess = new Chess(move.fenAfter);
        chess.move({ from: opponentReply.slice(0, 2), to: opponentReply.slice(2, 4), promotion: opponentReply[4] });
        const afterReply = material(chess.fen());
        return turn === 'w'
          ? afterReply.white - afterReply.black - (beforeReply.white - beforeReply.black)
          : afterReply.black - afterReply.white - (beforeReply.black - beforeReply.white);
      } catch {
        return 0;
      }
    })();
    // Real sacrifices are only visible two plies out: the opponent's capture and
    // our recapture. A queen trade nets out to zero and must not look heroic.
    const offeredMaterial = (() => {
      const reply = after?.lines?.[0]?.pv?.[0];
      if (!reply) return 0;
      const beforeReply = material(move.fenAfter);
      const base = turn === 'w' ? beforeReply.white - beforeReply.black : beforeReply.black - beforeReply.white;
      try {
        const chess = new Chess(move.fenAfter);
        chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
        const recapture = after?.lines?.[0]?.pv?.[1];
        if (recapture) {
          try {
            chess.move({ from: recapture.slice(0, 2), to: recapture.slice(2, 4), promotion: recapture[4] });
          } catch {
            /* the mover may not have a follow-up */
          }
        }
        const now = material(chess.fen());
        const delta = turn === 'w' ? now.white - now.black : now.black - now.white;
        return Math.max(0, base - delta);
      } catch {
        return 0;
      }
    })();

    let legalMoves = 0;
    try {
      legalMoves = new Chess(move.fenBefore).moves().length;
    } catch {
      legalMoves = 2;
    }

    const { classification, rank, tags } = classifyMove({
      playedUci: move.uci,
      playedSan: move.san,
      bestUci: bestLine?.pv?.[0] ?? before?.bestmove ?? null,
      lines: before?.lines ?? [],
      wpBeforeMover,
      wpAfterMover: wpAfterEffective,
      loss,
      sacrifice: offeredMaterial,
      legalMoves,
    });

    // Did the mover have a forced mate before the move and throw it away?
    const mateBeforeMover = bestLine?.mate != null ? bestLine.mate : null;
    const mateAfterMover = afterLine?.mate != null ? -afterLine.mate : null;
    const shot = move.san.includes('#');
    const mateStillOn = mateAfterMover != null && mateAfterMover > 0;
    if (mateBeforeMover != null && mateBeforeMover > 0 && !mateStillOn && !shot && loss >= 2) {
      tags.push('missedMate');
    }

    const bestSan = uciToSan(move.fenBefore, bestLine?.pv?.[0] ?? null);
    const bestLineSan = pvToSan(move.fenBefore, bestLine?.pv ?? [], 5);

    const phase = phaseFor(i, move.fenAfter, moves.length);
    const accuracy = accuracyFor(wpBeforeMover, wpAfterEffective);

    const reviewed = {
      ply: move.ply,
      moveNumber: move.moveNumber,
      color: turn,
      san: move.san,
      uci: move.uci,
      fenBefore: move.fenBefore,
      fenAfter: move.fenAfter,
      isCheck: move.isCheck,
      isCapture: !!move.captured,
      isCastle: move.isCastle,
      isPromotion: move.isPromotion,
      phase,
      opening,
      classification,
      rank,
      tags,
      loss: Math.round(loss * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      evalCpBefore,
      evalCpAfter,
      mateBefore,
      mateAfter,
      wpBefore: Math.round(wpBeforeMover * 1000) / 10,
      wpAfter: Math.round(wpAfterMover * 1000) / 10,
      bestSan,
      bestUci: bestLine?.pv?.[0] ?? null,
      bestLine: bestLineSan,
      secondSan: uciToSan(move.fenBefore, secondLine?.pv?.[0] ?? null),
      secondEval: secondLine ? scoreToCp({ cp: secondLine.cp, mate: secondLine.mate }) : null,
      bestEval: bestLine ? scoreToCp({ cp: bestLine.cp, mate: bestLine.mate }) : null,
      reply:
        replyGain <= -150 && replyPiece && loss >= 3.5
          ? { san: uciToSan(move.fenAfter, opponentReply), piece: replyPiece }
          : null,
      sacrifice: offeredMaterial,
    };

    reviewed.coach = moveCoach(reviewed);

    const player = players[turn];
    player.accuracies.push(accuracy);
    const countKey = classification;
    if (countKey in player.counts) player.counts[countKey] += 1;
    for (const tag of tags) {
      if (tag === 'missedWin') player.counts.missedWin += 1;
      if (tag === 'missedMate') player.counts.missedMate += 1;
    }
    player.phases[phase] = player.phases[phase] ?? [];
    player.phases[phase].push(accuracy);

    reviewedMoves.push(reviewed);
  }

  const playerSummary = {};
  for (const color of ['w', 'b']) {
    const player = players[color];
    const accuracy = player.accuracies.length
      ? player.accuracies.reduce((sum, value) => sum + value, 0) / player.accuracies.length
      : 0;
    const accuracyByPhase = {};
    for (const [phase, values] of Object.entries(player.phases)) {
      accuracyByPhase[phase] = values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    const ownMoves = reviewedMoves.filter((move) => move.color === color);
    const keyMoment = [...ownMoves].sort((a, b) => b.loss - a.loss)[0] ?? null;
    const summary = buildSummary({
      color,
      accuracy,
      counts: player.counts,
      accuracyByPhase,
      opening,
      result: headers.Result ?? '*',
      keyMoment,
      elo: player.elo,
      name: player.name,
    });
    playerSummary[color] = {
      name: player.name,
      elo: player.elo,
      accuracy: Math.round(accuracy * 10) / 10,
      accuracyByPhase,
      counts: player.counts,
      grade: summary.grade,
      summary,
    };
  }

  const keyMoments = [...reviewedMoves]
    .filter((move) => move.loss >= 8 || move.classification === 'brilliant')
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 6)
    .map((move) => move.ply);

  return {
    engine: { name: engine.name, depth },
    meta: {
      white: headers.White ?? 'White',
      black: headers.Black ?? 'Black',
      whiteElo: headers.WhiteElo ?? null,
      blackElo: headers.BlackElo ?? null,
      result: headers.Result ?? '*',
      date: headers.UTCDate ?? headers.Date ?? null,
      event: headers.Event ?? null,
      site: headers.Site ?? null,
      timeControl: headers.TimeControl ?? null,
      termination: headers.Termination ?? null,
      opening,
      eco: headers.ECO ?? null,
      startFen,
      totalPlies: reviewedMoves.length,
    },
    moves: reviewedMoves,
    players: playerSummary,
    keyMoments,
  };
}
