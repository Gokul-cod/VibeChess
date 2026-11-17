const PIECE_NAMES = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

function pick(list, seed) {
  return list[Math.abs(Math.round(seed)) % list.length];
}

function pawns(cp) {
  return Math.abs(cp / 100).toFixed(1);
}

/** Short evaluation label from the perspective of `color`. */
export function evalLabel(cp, color = 'w') {
  const pov = color === 'w' ? cp : -cp;
  const signed = `${pov > 0 ? '+' : '-'}${pawns(pov)}`;
  if (pov >= 6000) return 'a forced win';
  if (pov >= 250) return `completely winning (${signed})`;
  if (pov >= 120) return `clearly better (${signed})`;
  if (pov >= 40) return `slightly better (${signed})`;
  if (pov > -40) return 'dead level';
  if (pov > -120) return `slightly worse (${signed})`;
  if (pov > -250) return `clearly worse (${signed})`;
  if (pov > -6000) return `lost (${signed})`;
  return 'getting mated';
}

export function mateLabel(mate, color) {
  const pov = color === 'w' ? mate : -mate;
  return pov > 0 ? `mate in ${pov}` : `you are getting mated in ${Math.abs(pov)}`;
}

function classificationBase(move) {
  const { classification, san, color, loss, bestSan, bestLine, reply, ply } = move;
  const side = color === 'w' ? 'White' : 'Black';
  const line = bestLine && bestLine.length > 1 ? bestLine.slice(0, 5).join(' ') : null;
  const nextBest = line ? `The line runs ${line}.` : '';
  const loose = move.reply ? `Now ${reply.san} snaps off your ${PIECE_NAMES[reply.piece] ?? 'piece'}.` : '';

  switch (classification) {
    case 'brilliant':
      return {
        title: pick(['A sacrifice with flavour', 'That is a brilliant find', 'Bold, and it works'], ply),
        mood: 'proud',
        body: `${san} gives up material on purpose and the position is still ${evalLabel(move.evalCpAfter, color)} for you. ${nextBest} ${
          pick(['Most players would never find that.', 'That is the kind of move people remember.', 'A double shot of courage.'], ply)
        }`,
      };
    case 'great':
      return {
        title: pick(['The only move that holds', 'A precise, narrow path', 'Nothing else worked'], ply),
        mood: 'proud',
        body: `${san} is the single move that keeps your position together — everything else drops off sharply. ${nextBest}`.trim(),
      };
    case 'best':
      return {
        title: pick(['Exactly right', 'Stockfish approves', 'Top of the menu'], ply),
        mood: 'happy',
        body: `${san} is the engine's first choice. The position is ${evalLabel(move.evalCpAfter, color)} for you. ${nextBest}`.trim(),
      };
    case 'excellent':
      return {
        title: pick(['Practically perfect', 'Very nearly the top pick', 'Almost flawless'], ply),
        mood: 'happy',
        body: `${san} is essentially as good as ${bestSan ?? 'the top move'} — barely a whisker of difference. ${nextBest}`.trim(),
      };
    case 'good':
      return {
        title: pick(['Solid, not spectacular', 'A sound move', 'Nothing wrong with that'], ply),
        mood: 'neutral',
        body: `${san} is fine, though ${bestSan ?? 'the top move'} was a touch more accurate. The position is ${evalLabel(
          move.evalCpAfter,
          color,
        )} for you.`,
      };
    case 'inaccuracy':
      return {
        title: pick(['A little sloppy', 'This lets some air out', 'Small but real'], ply),
        mood: 'thinking',
        body: `${san} costs you about ${Math.round(loss)}% of your winning chances. ${
          bestSan ?? 'The top move'
        } was more precise — ${line ? `${line}.` : 'it keeps the position under control.'} ${loose}`.trim(),
      };
    case 'mistake':
      return {
        title: pick(['This one hurts', 'A costly slip', 'The thread starts to fray'], ply),
        mood: 'worried',
        body: `${san} is a mistake: your winning chances drop by roughly ${Math.round(loss)}%, and the position swings from ${evalLabel(
          move.evalCpBefore,
          color,
        )} to ${evalLabel(move.evalCpAfter, color)}. ${bestSan ? `You needed ${bestSan}.` : ''} ${nextBest} ${loose}`.trim(),
      };
    case 'blunder':
      return {
        title: pick(['Ouch — that is a blunder', 'A big spill', 'That one really stings'], ply),
        mood: 'alarmed',
        body: `${san} gives away about ${Math.round(loss)}% of your winning chances, and the evaluation flips from ${evalLabel(
          move.evalCpBefore,
          color,
        )} to ${evalLabel(move.evalCpAfter, color)}. ${bestSan ? `The move was ${bestSan}.` : ''} ${nextBest} ${loose}`.trim(),
      };
    case 'forced':
      return {
        title: 'Nothing else was legal',
        mood: 'neutral',
        body: `${san} was the only legal move, so there is nothing to grade here. ${nextBest}`.trim(),
      };
    default:
      return {
        title: 'Move reviewed',
        mood: 'neutral',
        body: `${san} keeps the position ${evalLabel(move.evalCpAfter, color)} for you.`,
      };
  }
}

/** Produce the coach's take on a single move. */
export function moveCoach(move) {
  const base = classificationBase(move);
  const tags = move.tags ?? [];

  if (tags.includes('missedMate')) {
    return {
      title: 'Mate was right there',
      mood: 'alarmed',
      body: `You had ${mateLabel(move.mateBefore, move.color)} before ${move.san}. After it, the mate is gone. ${
        move.bestSan ? `The kill was ${move.bestSan}.` : ''
      } ${move.bestLine?.length ? `Line: ${move.bestLine.slice(0, 5).join(' ')}.` : ''}`.trim(),
    };
  }

  if (tags.includes('missedWin')) {
    return {
      title: 'You let a winning game slip',
      mood: 'worried',
      body: `Before ${move.san} you were ${evalLabel(move.evalCpBefore, move.color)}; afterwards only ${evalLabel(
        move.evalCpAfter,
        move.color,
      )}. ${move.bestSan ? `${move.bestSan} would have kept the grip.` : ''} ${
        move.bestLine?.length > 1 ? `The line was ${move.bestLine.slice(0, 5).join(' ')}.` : ''
      }`.trim(),
    };
  }

  if (move.phase === 'opening' && move.ply <= 14 && ['best', 'excellent', 'good'].includes(move.classification)) {
    const named = move.ply <= 10 && move.opening ? ` in the ${move.opening}` : '';
    return {
      title: pick(['Comfortable opening play', 'Book-ish and healthy', 'Sensible development'], move.ply),
      mood: 'happy',
      body: `${move.san} follows sound opening principles${named}. ${
        move.bestLine?.length > 1 ? `Stockfish's line: ${move.bestLine.slice(0, 4).join(' ')}.` : ''
      }`.trim(),
    };
  }

  return base;
}

export function buildSummary({ color, accuracy, counts, accuracyByPhase, opening, result, keyMoment, elo, name }) {
  const grade = accuracy >= 92 ? 'A' : accuracy >= 84 ? 'B' : accuracy >= 74 ? 'C' : accuracy >= 62 ? 'D' : 'E';
  const won = (color === 'w' && result === '1-0') || (color === 'b' && result === '0-1');
  const drew = result === '1/2-1/2';
  const takeaway = [];
  const sideName = color === 'w' ? 'White' : 'Black';

  let headline;
  if (won && accuracy >= 85) headline = 'A win served clean, with hardly a wobble.';
  else if (won) headline = 'You got the full point — now let us tidy up the rough edges.';
  else if (drew) headline = 'A draw, and a fair reflection of the play.';
  else if (accuracy >= 85) headline = 'A strong game that the result did not reward.';
  else headline = 'Tough result, but there is plenty to work with here.';

  if (counts.blunder > 0) {
    takeaway.push({
      title: `${counts.blunder} blunder${counts.blunder > 1 ? 's' : ''} to clean up`,
      body: `Blunders cost you the most: ${counts.blunder} move${counts.blunder > 1 ? 's' : ''} where the evaluation fell off a cliff. Slow down on forcing sequences and check every capture and check before you play it.`,
    });
  }
  if (counts.mistake > 0) {
    takeaway.push({
      title: 'Watch the quiet moves',
      body: `${counts.mistake} mistake${counts.mistake > 1 ? 's' : ''} came mostly from drifting plans. Before a quiet move, ask what your opponent's best reply would be — the engine punished exactly those moments.`,
    });
  }
  if (counts.brilliant + counts.great > 0) {
    takeaway.push({
      title: 'Real highlights to keep',
      body: `You produced ${counts.brilliant} brilliant and ${counts.great} great move${
        counts.brilliant + counts.great > 1 ? 's' : ''
      }. Those were the moments where you found the only move — that instinct is your strength.`,
    });
  }
  const phaseEntries = [
    ['opening', 'opening'],
    ['middlegame', 'middlegame'],
    ['endgame', 'endgame'],
  ].filter(([key]) => typeof accuracyByPhase[key] === 'number');
  phaseEntries.sort((a, b) => accuracyByPhase[a[0]] - accuracyByPhase[b[0]]);
  if (phaseEntries.length > 1) {
    const [worst] = phaseEntries;
    const best = phaseEntries[phaseEntries.length - 1];
    takeaway.push({
      title: `Your ${best[0]} was the sharpest part`,
      body: `Accuracy by phase: ${phaseEntries
        .map(([key]) => `${key} ${Math.round(accuracyByPhase[key])}%`)
        .join(', ')}. The ${worst[0]} is where to spend your next study session.`,
    });
  }
  if (counts.missedWin > 0) {
    takeaway.push({
      title: 'Finish the job',
      body: `You reached a winning position ${counts.missedWin} time${counts.missedWin > 1 ? 's' : ''} and let it go. When you are winning, trade pieces, not pawns, and keep the king safe.`,
    });
  }
  if (!takeaway.length) {
    takeaway.push({
      title: 'A clean sheet',
      body: 'No blunders, no missed wins, no real mistakes. That is a game to be proud of — the next step is turning this level into your default.',
    });
  }

  const biggest = keyMoment
    ? `The turning point was move ${keyMoment.moveNumber}${keyMoment.color === 'w' ? '.' : '...'} ${keyMoment.san} — ${
        keyMoment.classification === 'blunder' ? 'a blunder' : keyMoment.classification === 'mistake' ? 'a mistake' : 'a slip'
      } that cost ${Math.round(keyMoment.loss)}% of your winning chances.`
    : 'No single moment decided this game — it was a steady grind.';

  return {
    headline,
    grade,
    mood: grade === 'A' || grade === 'B' ? 'proud' : grade === 'C' ? 'thinking' : 'worried',
    accuracy: Math.round(accuracy * 10) / 10,
    takeaways: takeaway.slice(0, 3),
    turningPoint: biggest,
    intro: `${name ? name : sideName}${elo ? ` (${elo})` : ''} finished with ${accuracy.toFixed(1)}% accuracy. ${biggest}`,
    resultLine: won ? 'You won.' : drew ? 'You drew.' : 'You lost.',
  };
}

/** A short, in-character line for the loading screen while the engine works. */
export function analysisBanter(step, total) {
  const lines = [
    'Warming up the grinder — Stockfish 19 is reading the position.',
    'Checking who stood better in every position. Bear with me.',
    'Pouring over the tactics. This is the good part.',
    'Found something interesting on move 12, keep your cup close.',
    'Almost done — I am double-checking the quiet moves.',
  ];
  const index = Math.min(lines.length - 1, Math.floor((step / Math.max(total, 1)) * lines.length));
  return lines[index];
}
