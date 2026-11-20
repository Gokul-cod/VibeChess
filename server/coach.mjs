/**
 * Review commentary.
 *
 * Every sentence is built from something the review actually measured: the
 * engine's evaluation, its principal variation, the material in that line, and
 * the pieces left loose on the board. There are no canned one-liners.
 */
import { PIECE_NAMES } from './motifs.mjs';

function cpFor(cp, color) {
  return color === 'w' ? cp : -cp;
}

function mateFor(mate, color) {
  if (mate == null) return null;
  return color === 'w' ? mate : -mate;
}

function pawns(cp) {
  const value = Math.abs(cp) / 100;
  return `${value.toFixed(1)} pawns`;
}

/** Signed evaluation from the mover's point of view: +1.2, -0.4, level. */
export function evalNumber(cp, color = 'w') {
  const raw = cpFor(cp ?? 0, color);
  if (Math.abs(raw) >= 9000) return raw > 0 ? 'checkmate' : 'checkmated';
  const pov = raw / 100;
  if (Math.abs(pov) < 0.05) return 'level';
  return `${pov > 0 ? '+' : ''}${pov.toFixed(1)}`;
}

/** Plain-language standing from the mover's point of view. */
export function standing(cp, color = 'w', mate = null) {
  const matePov = mateFor(mate, color);
  if (matePov != null) return matePov > 0 ? `mating in ${matePov}` : `getting mated in ${Math.abs(matePov)}`;
  const pov = cpFor(cp ?? 0, color);
  if (pov >= 9000) return 'checkmate';
  if (pov <= -9000) return 'checkmated';
  if (pov >= 400) return `winning (${evalNumber(cp, color)})`;
  if (pov >= 150) return `clearly better (${evalNumber(cp, color)})`;
  if (pov >= 60) return `slightly better (${evalNumber(cp, color)})`;
  if (pov > -60) return 'level';
  if (pov > -150) return `slightly worse (${evalNumber(cp, color)})`;
  if (pov > -400) return `clearly worse (${evalNumber(cp, color)})`;
  return `lost (${evalNumber(cp, color)})`;
}

export function moveLabel(move) {
  return `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`;
}

function lineSentence(move, limit = 5) {
  const line = move.bestLine;
  if (!line || line.length < 2) return '';
  return `The engine's line runs ${line.slice(0, limit).join(' ')}.`;
}

function targetSentence(move) {
  if (move.mateAfter != null) return '';
  const targets = move.facts?.newTargets ?? [];
  if (!targets.length) return '';
  const first = targets[0];
  const piece = PIECE_NAMES[first.type] ?? 'piece';
  const more = targets.length > 1 ? ` and the ${PIECE_NAMES[targets[1].type] ?? 'piece'} on ${targets[1].square}` : '';
  const undefended = first.defenders === 0 ? ', which is undefended' : '';
  return ` It also targets the ${piece} on ${first.square}${undefended}${more}.`;
}

/** The single fact that explains what went wrong, in as few words as possible. */
export function errorCause(move) {
  const facts = move.facts ?? {};
  const loose = facts.looseAfter ?? [];
  const replySan = facts.replySan;
  if (facts.replyMateIn != null && replySan) return `${replySan} forces mate in ${facts.replyMateIn}`;
  if (loose.length && facts.replyCapturesLoose) {
    const target = loose.find((piece) => piece.square === facts.replyCapturesLoose.square) ?? loose[0];
    return `${replySan} wins the ${PIECE_NAMES[target.type] ?? 'piece'} on ${target.square}`;
  }
  if (loose.length) {
    const target = loose[0];
    return `the ${PIECE_NAMES[target.type] ?? 'piece'} on ${target.square} is left loose (${target.attackers} attacker${
      target.attackers === 1 ? '' : 's'}, ${target.defenders} defender${target.defenders === 1 ? '' : 's'})`;
  }
  if (typeof facts.materialNet === 'number' && facts.materialNet <= -100) {
    return `the engine's continuation leaves ${pawns(facts.materialNet)} of material behind`;
  }
  return `the evaluation falls from ${evalNumber(move.evalCpBefore, move.color)} to ${evalNumber(
    move.evalCpAfter,
    move.color,
  )}`;
}

function adviceFor(move) {
  const facts = move.facts ?? {};
  if (facts.replyMateIn != null) {
    return 'When your king comes under fire, check every checking move before anything else.';
  }
  if (facts.replyCapturesLoose) {
    return 'Before you play a move, count how many times each of your pieces is attacked and defended. The one that does not balance is the one that gets taken.';
  }
  if (typeof facts.materialNet === 'number' && facts.materialNet <= -100) {
    return 'Check every capture and every check on the board before you commit. Material does not come back by itself.';
  }
  if (move.classification === 'inaccuracy') {
    return 'Nothing was lost tactically — the engine simply liked a more active move. Ask what your move improves before you play it.';
  }
  return 'Work backwards from your opponent\'s most forcing reply. That is where the engine found the refutation.';
}

function classificationBase(move) {
  const { classification, san, color, bestSan, mateBefore, mateAfter, tags } = move;
  const after = move.evalCpAfter;
  const before = move.evalCpBefore;
  const mateAfterPov = mateFor(mateAfter, color);
  const evalSentence =
    mateAfterPov != null
      ? mateAfterPov > 0
        ? `It is mate in ${mateAfterPov} for you.`
        : `You are getting mated in ${Math.abs(mateAfterPov)}.`
      : cpFor(after, color) >= 9000
        ? 'That is checkmate — the game is over.'
        : cpFor(after, color) <= -9000
          ? 'That is checkmate against you.'
          : `The evaluation sits at ${evalNumber(after, color)} for you.`;
  const loss = Math.max(0, Math.round(move.loss ?? 0));

  if (san.endsWith('#')) {
    return {
      title: 'Checkmate',
      mood: 'proud',
      body: `${san} finishes the game — there is nothing left to defend.`,
    };
  }

  if (tags?.includes('missedMate')) {
    const had = mateFor(mateBefore, color);
    return {
      title: 'A forced mate was on the board',
      mood: 'alarmed',
      body: `You had mate in ${had} before ${san}, and ${san} let it go. ${
        bestSan ? `${bestSan} was the finish.` : ''
      } ${lineSentence(move)}`.trim(),
    };
  }

  switch (classification) {
    case 'brilliant':
      return {
        title: 'A sacrifice that works',
        mood: 'proud',
        body: `${san} gives up ${pawns(move.sacrifice || 0)} on purpose and you are still ${standing(
          after,
          color,
          mateAfter,
        )}. ${lineSentence(move)}`.trim(),
      };
    case 'great':
      return {
        title: 'The only move that holds',
        mood: 'proud',
        body: `${san} is the one move that keeps the position together — everything else drops off sharply. You are ${standing(
          after,
          color,
          mateAfter,
        )}. ${lineSentence(move)}`.trim(),
      };
    case 'best':
      return {
        title: 'The engine\'s top choice',
        mood: 'happy',
        body: `${san} is exactly what Stockfish plays here.${targetSentence(move)} ${evalSentence} ${lineSentence(
          move,
        )}`.trim(),
      };
    case 'excellent':
      return {
        title: 'As good as the top move',
        mood: 'happy',
        body: `${san} is within a whisker of ${bestSan ?? 'the top move'}. ${evalSentence}`.trim(),
      };
    case 'good':
      return {
        title: 'Playable, but not the best',
        mood: 'neutral',
        body: `${san} is sound, though ${bestSan ?? 'the top move'} keeps you ${standing(
          move.bestEval,
          color,
        )} instead of ${standing(after, color)}. ${lineSentence(move)}`.trim(),
      };
    case 'inaccuracy':
    case 'mistake':
    case 'blunder': {
      const severity =
        classification === 'blunder' ? 'is a blunder' : classification === 'mistake' ? 'is a mistake' : 'is an inaccuracy';
      const title =
        classification === 'blunder'
          ? `Blunder: ${san} costs ${loss}%`
          : classification === 'mistake'
            ? `Mistake: ${san} costs ${loss}%`
            : `Inaccuracy: ${san}`;
      const pieces = [
        `${san} ${severity}: ${loss}% of your winning chances, and you go from ${standing(
          before,
          color,
          mateBefore,
        )} to ${standing(after, color, mateAfter)}.`,
        move.facts?.replySan ? `The refutation is ${move.facts.replySan}.` : '',
        bestSan ? `${bestSan} was the move — it keeps you ${standing(move.bestEval, color)}.` : '',
        lineSentence(move),
        adviceFor(move),
      ].filter(Boolean);
      return {
        title,
        mood: classification === 'blunder' ? 'alarmed' : classification === 'mistake' ? 'worried' : 'thinking',
        body: pieces.join(' '),
      };
    }
    case 'forced':
      return {
        title: 'Forced — nothing to grade',
        mood: 'neutral',
        body: `${san} was the only legal move. ${lineSentence(move)}`.trim(),
      };
    default:
      return {
        title: 'Move reviewed',
        mood: 'neutral',
        body: `${san} leaves you ${standing(after, color, mateAfter)}.`,
      };
  }
}

/** The coach's take on a single move. */
export function moveCoach(move) {
  const base = classificationBase(move);
  if (move.tags?.includes('missedWin') && !move.tags.includes('missedMate')) {
    const lostWin = Math.max(0, Math.round(move.wpBefore - move.wpAfter));
    return {
      title: 'A winning position let slip',
      mood: 'worried',
      body: `${move.san} throws away ${lostWin}% of your winning chances: you were ${standing(
        move.evalCpBefore,
        move.color,
        move.mateBefore,
      )} and now you are ${standing(move.evalCpAfter, move.color, move.mateAfter)}. ${
        move.bestSan ? `${move.bestSan} was the better try — it holds ${standing(move.bestEval, move.color)}.` : ''
      } ${lineSentence(move)}`.trim(),
    };
  }
  return base;
}

function phaseEntries(accuracyByPhase) {
  return [
    ['opening', 'opening'],
    ['middlegame', 'middlegame'],
    ['endgame', 'endgame'],
  ]
    .filter(([key]) => typeof accuracyByPhase?.[key] === 'number')
    .sort((a, b) => accuracyByPhase[a[0]] - accuracyByPhase[b[0]]);
}

/**
 * Report-card summary. `mistakes` is the player's own moves, already reviewed,
 * so every takeaway can point at a real move and a real number.
 */
export function buildSummary({
  color,
  accuracy,
  counts,
  accuracyByPhase,
  opening,
  result,
  keyMoment,
  elo,
  name,
  mistakes = [],
}) {
  const grade = accuracy >= 92 ? 'A' : accuracy >= 84 ? 'B' : accuracy >= 74 ? 'C' : accuracy >= 62 ? 'D' : 'E';
  const won = (color === 'w' && result === '1-0') || (color === 'b' && result === '0-1');
  const drew = result === '1/2-1/2';
  const sideName = color === 'w' ? 'White' : 'Black';
  const ownMoves = mistakes.filter((move) => move && move.san);
  const errors = ownMoves
    .filter((move) => ['inaccuracy', 'mistake', 'blunder'].includes(move.classification))
    .sort((a, b) => b.loss - a.loss);
  const serious = ownMoves
    .filter((move) => ['mistake', 'blunder'].includes(move.classification))
    .sort((a, b) => b.loss - a.loss);

  let headline;
  if (won && accuracy >= 85) headline = 'A clean win — the engine barely found a wobble.';
  else if (won) headline = 'The full point is yours; the errors in it are fixable.';
  else if (drew) headline = 'A draw that matches the play.';
  else if (accuracy >= 85) headline = 'A well-played game that the result did not reward.';
  else headline = 'A tough result with clear, specific things to fix.';

  const takeaways = [];

  if (serious.length) {
    const listed = serious
      .slice(0, 3)
      .map((move) => `${moveLabel(move)} (${move.classification}, −${Math.round(move.loss)}%) — ${errorCause(move)}`)
      .join('; ');
    takeaways.push({
      title: serious.length === 1 ? 'The move that decided it' : `Your ${serious.length} serious errors`,
      body: `In order of cost: ${listed}. Each one is a single position you can replay from the move list and solve again.`,
    });
  }

  const looseCount = serious.filter((move) => move.facts?.replyCapturesLoose).length;
  const materialCount = serious.filter(
    (move) => !move.facts?.replyCapturesLoose && typeof move.facts?.materialNet === 'number' && move.facts.materialNet <= -100,
  ).length;
  if (looseCount >= 2) {
    takeaways.push({
      title: 'The pattern: loose pieces',
      body: `${looseCount} of your ${serious.length} serious errors were pieces left attacked more often than defended — ${serious
        .filter((move) => move.facts?.replyCapturesLoose)
        .slice(0, 2)
        .map((move) => `${moveLabel(move)} (${move.facts.replySan})`)
        .join(' and ')}. Before each move, run through your own pieces and ask which one your opponent can hit next.`,
    });
  } else if (materialCount >= 2) {
    takeaways.push({
      title: 'The pattern: material',
      body: `${materialCount} of your ${serious.length} serious errors lost material in the engine's continuation. In each of those positions a forcing move existed for the opponent — check every capture and check on the board before you play yours.`,
    });
  }

  const phases = phaseEntries(accuracyByPhase);
  if (phases.length > 1) {
    const [worst, best] = [phases[0], phases[phases.length - 1]];
    const spread = accuracyByPhase[best[0]] - accuracyByPhase[worst[0]];
    if (spread >= 3) {
      const example = serious.find((move) => phaseKeyFor(move) === worst[0]);
      takeaways.push({
        title: `Weakest phase: ${worst[0]} (${Math.round(accuracyByPhase[worst[0]])}%)`,
        body: `Your accuracy ran ${phases
          .map(([key]) => `${key} ${Math.round(accuracyByPhase[key])}%`)
          .join(', ')}. ${example ? `${moveLabel(example)} is the clearest example of the ${worst[0]} problem.` : ''} ${best[0].replace(
          /^./,
          (letter) => letter.toUpperCase(),
        )} was your sharpest phase (${Math.round(accuracyByPhase[best[0]])}%).`.replace(/\s+/g, ' '),
      });
    }
  }

  if (counts.missedWin > 0) {
    takeaways.push({
      title: `${counts.missedWin} winning position${counts.missedWin > 1 ? 's' : ''} let go`,
      body: `You were winning and let the evaluation drop in ${counts.missedWin} position${
        counts.missedWin > 1 ? 's' : ''
      }. In those spots the test is simple: find your opponent's one active piece and take it away before you push anything.`,
    });
  }

  if (!takeaways.length) {
    takeaways.push({
      title: 'Nothing to repair',
      body: `No mistakes and no blunders. The breakdown of ${ownMoves.length} moves: ${[
        ['brilliant', 'brilliant'],
        ['great', 'great'],
        ['best', 'best'],
        ['excellent', 'excellent'],
        ['good', 'good'],
        ['inaccuracy', 'inaccuracy'],
        ['forced', 'forced'],
      ]
        .filter(([key]) => counts[key] > 0)
        .map(([key, label]) => `${counts[key]} ${label}`)
        .join(', ')}. The next step is making this your normal level rather than a good day.`,
    });
  }

  const worstMove = errors[0] ?? keyMoment ?? null;
  const biggest = worstMove
    ? `The costliest moment was ${moveLabel(worstMove)} — ${errorCause(worstMove)}.`
    : 'No single moment decided this game.';

  return {
    headline,
    grade,
    mood: grade === 'A' || grade === 'B' ? 'proud' : grade === 'C' ? 'thinking' : 'worried',
    accuracy: Math.round(accuracy * 10) / 10,
    takeaways: takeaways.slice(0, 3),
    turningPoint: biggest,
    intro: `${name ? name : sideName}${elo ? ` (${elo})` : ''} finished with ${accuracy.toFixed(1)}% accuracy. ${biggest}`,
    resultLine: won ? 'You won.' : drew ? 'You drew.' : 'You lost.',
  };
}

function phaseKeyFor(move) {
  if (move.phase) return move.phase;
  return 'middlegame';
}

/** Loading copy while the engine grinds. */
export function analysisBanter(step, total) {
  const pct = total > 0 ? Math.min(100, Math.round((step / total) * 100)) : 0;
  return `Stockfish 19 is analysing position ${step} of ${total} (${pct}%).`;
}
