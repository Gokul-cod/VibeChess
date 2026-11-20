import { Chess } from 'chess.js';
import { moveCoach, buildSummary } from './coach.mjs';
import { gameAccuracy, moveAccuracy, winPercentFromScore } from './accuracy.mjs';
import { lineMaterial, loosePieces, newTargets } from './motifs.mjs';
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
function terminalScore(fen) {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) {
      const whiteMated = chess.turn() === 'w';
      return { cp: whiteMated ? -10000 : 10000, mate: whiteMated ? -1 : 1 };
    }
    return { cp: 0, mate: null };
  } catch {
    return { cp: 0, mate: null };
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
  // Win chances arrive as percentages (0-100), matching the Lichess curve.
  if (wpBeforeMover >= 82 && wpAfterMover <= 60) tags.push('missedWin');

  if (sacrifice >= 250 && wpAfterMover >= 55 && (isBest || rank === 2)) {
    tags.push('sacrifice');
    return { classification: 'brilliant', isBest, rank, tags };
  }
  if (isBest && isOnlyMove && wpBeforeMover > 15 && wpBeforeMover < 85) {
    return { classification: 'great', isBest, rank, tags };
  }
  if (loss >= 18) return { classification: 'blunder', isBest, rank, tags };
  if (loss >= 9) return { classification: 'mistake', isBest, rank, tags };
  if (loss >= 3.5) return { classification: 'inaccuracy', isBest, rank, tags };
  if (isBest) return { classification: 'best', isBest, rank, tags };
  if (loss < 1.5 && rank <= 2) return { classification: 'excellent', isBest, rank, tags };
  return { classification: 'good', isBest, rank, tags };
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
    w: { name: headers.White ?? 'White', elo: headers.WhiteElo ?? null, counts: emptyCounts(), accuracies: [], phaseSeries: {} },
    b: { name: headers.Black ?? 'Black', elo: headers.BlackElo ?? null, counts: emptyCounts(), accuracies: [], phaseSeries: {} },
  };

  // White-POV evaluation and win chance for every position in the game.
  const evals = positions.map((fen, index) => {
    if (index === 0) return { cp: 0, mate: null };
    const line = analyses[index]?.lines?.[0] ?? null;
    const mover = moves[index - 1].color;
    const sign = mover === 'w' ? -1 : 1;
    if (!line) return terminalScore(fen);
    return {
      cp: scoreToCp({ cp: line.cp, mate: line.mate }) * sign,
      mate: line.mate != null ? line.mate * sign : null,
    };
  });
  const winPercents = evals.map((entry) => winPercentFromScore(entry.cp, entry.mate));
  const accuracyReport = gameAccuracy(winPercents, moves.map((move) => move.color));

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const before = analyses[i];
    const after = analyses[i + 1];
    const turn = move.color;

    const bestLine = before?.lines?.[0] ?? null;
    const secondLine = before?.lines?.[1] ?? null;
    const afterLine = after?.lines?.[0] ?? null;

    // Stockfish reports from the side to move. Everything stored is White POV.
    const evalCpBefore = evals[i].cp;
    const evalCpAfter = evals[i + 1].cp;
    const mateBefore = evals[i].mate;
    const mateAfter = evals[i + 1].mate;

    // The Lichess definition of a move's cost: the raw drop in win probability.
    const wpBeforeMover = turn === 'w' ? winPercents[i] : 100 - winPercents[i];
    const wpAfterMover = turn === 'w' ? winPercents[i + 1] : 100 - winPercents[i + 1];
    const loss = Math.max(0, wpBeforeMover - wpAfterMover);

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

    const bestUci = bestLine?.pv?.[0] ?? before?.bestmove ?? null;
    const { classification, rank, tags } = classifyMove({
      playedUci: move.uci,
      playedSan: move.san,
      bestUci,
      lines: before?.lines ?? [],
      wpBeforeMover,
      wpAfterMover,
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

    const bestSan = uciToSan(move.fenBefore, bestUci);
    const bestLineSan = pvToSan(move.fenBefore, bestLine?.pv ?? [], 5);

    const phase = phaseFor(i, move.fenAfter, moves.length);
    const accuracy = moveAccuracy(wpBeforeMover, wpAfterMover);

    // Facts the commentary is written from: what the move gave up, what the
    // engine's line does to the material, and which pieces are left loose.
    const replyUci = afterLine?.pv?.[0] ?? null;
    const looseAfter = loosePieces(move.fenAfter, turn).slice(0, 3);
    const replyTarget = replyUci ? replyUci.slice(2, 4) : null;
    const facts = {
      materialNet: afterLine ? lineMaterial(move.fenAfter, afterLine.pv, turn, 4) : 0,
      bestMaterialNet: bestLine ? lineMaterial(move.fenBefore, bestLine.pv, turn, 4) : 0,
      looseAfter,
      looseBefore: loosePieces(move.fenBefore, turn).slice(0, 3),
      newTargets: newTargets(move.fenBefore, bestUci, turn),
      replySan: replyUci ? uciToSan(move.fenAfter, replyUci) : null,
      replyCapturesLoose: replyTarget ? looseAfter.find((piece) => piece.square === replyTarget) ?? null : null,
      replyMateIn: afterLine?.mate != null && afterLine.mate > 0 ? afterLine.mate : null,
    };

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
      wpBefore: Math.round(wpBeforeMover * 10) / 10,
      wpAfter: Math.round(wpAfterMover * 10) / 10,
      bestSan,
      bestUci: bestLine?.pv?.[0] ?? null,
      bestLine: bestLineSan,
      secondSan: uciToSan(move.fenBefore, secondLine?.pv?.[0] ?? null),
      secondEval: secondLine ? scoreToCp({ cp: secondLine.cp, mate: secondLine.mate }) * (turn === 'w' ? 1 : -1) : null,
      bestEval: bestLine ? scoreToCp({ cp: bestLine.cp, mate: bestLine.mate }) * (turn === 'w' ? 1 : -1) : null,
      reply:
        replyGain <= -150 && replyPiece && loss >= 3.5
          ? { san: uciToSan(move.fenAfter, opponentReply), piece: replyPiece }
          : null,
      sacrifice: offeredMaterial,
      facts,
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
    player.phaseSeries[phase] = player.phaseSeries[phase] ?? { winPercents: [], colors: [] };
    player.phaseSeries[phase].winPercents.push(wpBeforeMover, wpAfterMover);
    player.phaseSeries[phase].colors.push(turn);

    reviewedMoves.push(reviewed);
  }

  const playerSummary = {};
  for (const color of ['w', 'b']) {
    const player = players[color];
    const accuracy = accuracyReport[color] ?? 0;
    const accuracyByPhase = {};
    for (const [phase, series] of Object.entries(player.phaseSeries)) {
      accuracyByPhase[phase] = gameAccuracy(series.winPercents, series.colors)[color] ?? 0;
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
      mistakes: ownMoves,
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
