/**
 * Weekly report: folds a set of full game reviews into one diagnosis for a player.
 *
 * Pure data + text, no Node APIs, so the browser review path can import it too.
 */

const CLASS_ORDER = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced'];

function gradeFor(accuracy) {
  if (accuracy >= 92) return 'A';
  if (accuracy >= 88) return 'A-';
  if (accuracy >= 84) return 'B+';
  if (accuracy >= 79) return 'B';
  if (accuracy >= 74) return 'B-';
  if (accuracy >= 68) return 'C+';
  if (accuracy >= 60) return 'C';
  if (accuracy >= 52) return 'D+';
  return 'D';
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resultForPlayer(result, color) {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return color === 'w' ? 'win' : 'loss';
  if (result === '0-1') return color === 'b' ? 'win' : 'loss';
  return 'unfinished';
}

function playerColor(summary, username) {
  const handle = username.trim().toLowerCase();
  if (summary.white?.toLowerCase() === handle) return 'w';
  if (summary.black?.toLowerCase() === handle) return 'b';
  if (summary.playerColor === 'white') return 'w';
  if (summary.playerColor === 'black') return 'b';
  return 'w';
}

function shortOpening(name) {
  if (!name) return 'Unknown opening';
  const clean = name
    .replace(/\s*[:•].*$/, '')
    .replace(/\s+Variation.*$/i, '')
    .replace(/\s+\d+\..*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean.split(' ');
  return (words.length > 5 ? `${words.slice(0, 5).join(' ')}…` : clean) || 'Unknown opening';
}

export function buildWeeklyReport({ username, platform, from, to, entries, depth }) {
  const player = username.trim();

  const games = entries.map(({ summary, report }) => {
    const color = playerColor(summary, player);
    const side = report.players[color];
    const opponent = color === 'w' ? report.meta.black : report.meta.white;
    const opponentElo = color === 'w' ? report.meta.blackElo : report.meta.whiteElo;
    const result = resultForPlayer(report.meta.result, color);
    const ownMoves = report.moves.filter((move) => move.color === color);
    const peakWin = ownMoves.reduce((max, move) => Math.max(max, move.wpBefore ?? 0), 0);
    return {
      id: summary.id,
      color,
      opponent,
      opponentElo,
      result,
      accuracy: side.accuracy,
      accuracyByPhase: side.accuracyByPhase,
      counts: side.counts,
      grade: side.grade,
      opening: shortOpening(report.meta.opening ?? summary.opening),
      date: summary.date,
      url: summary.url,
      moves: ownMoves.length,
      peakWin: round(peakWin, 0),
      mistakes: ownMoves
        .filter((move) => move.classification === 'blunder' || move.classification === 'mistake')
        .map((move) => ({
          san: move.san,
          moveNumber: move.moveNumber,
          classification: move.classification,
          loss: move.loss,
          bestSan: move.bestSan,
          coach: move.coach?.title ?? null,
        })),
      missedWins: ownMoves.filter((move) => move.tags?.includes('missedWin')).length,
      missedMates: ownMoves.filter((move) => move.tags?.includes('missedMate')).length,
      summary,
    };
  });

  const played = games.filter((game) => game.result !== 'unfinished');
  const record = {
    win: played.filter((game) => game.result === 'win').length,
    loss: played.filter((game) => game.result === 'loss').length,
    draw: played.filter((game) => game.result === 'draw').length,
  };
  const score = record.win + record.draw * 0.5;

  const accuracy = average(games.map((game) => game.accuracy)) ?? 0;
  const accuracyByPhase = {};
  for (const phase of ['opening', 'middlegame', 'endgame']) {
    const values = games.map((game) => game.accuracyByPhase?.[phase]).filter((value) => typeof value === 'number');
    if (values.length) accuracyByPhase[phase] = round(average(values), 1);
  }

  const counts = Object.fromEntries(CLASS_ORDER.map((key) => [key, 0]));
  for (const game of games) {
    for (const key of CLASS_ORDER) counts[key] += game.counts?.[key] ?? 0;
  }
  const totalMoves = games.reduce((sum, game) => sum + game.moves, 0);

  const byOpening = new Map();
  for (const game of games) {
    const entry = byOpening.get(game.opening) ?? { name: game.opening, games: 0, score: 0, accuracy: [] };
    entry.games += 1;
    entry.score += game.result === 'win' ? 1 : game.result === 'draw' ? 0.5 : 0;
    entry.accuracy.push(game.accuracy);
    byOpening.set(game.opening, entry);
  }
  const openings = [...byOpening.values()]
    .map((entry) => ({
      name: entry.name,
      games: entry.games,
      score: round(entry.score, 1),
      accuracy: round(average(entry.accuracy) ?? 0, 1),
    }))
    .sort((a, b) => b.games - a.games || b.score - a.score)
    .slice(0, 4);

  const mistakes = games
    .flatMap((game) =>
      game.mistakes.map((mistake) => ({
        ...mistake,
        gameId: game.id,
        opponent: game.opponent,
        result: game.result,
        color: game.color,
        opening: game.opening,
      })),
    )
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 6);

  const sorted = [...games].sort((a, b) => b.accuracy - a.accuracy);
  const bestGame = sorted[0] ?? null;
  const worstGame = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  const whiteGames = games.filter((game) => game.color === 'w');
  const blackGames = games.filter((game) => game.color === 'b');
  const colorSplit = {
    white: { games: whiteGames.length, accuracy: round(average(whiteGames.map((game) => game.accuracy)) ?? 0, 1) },
    black: { games: blackGames.length, accuracy: round(average(blackGames.map((game) => game.accuracy)) ?? 0, 1) },
  };

  // A game where a player was winning but did not convert.
  const blownLeads = games.filter((game) => game.peakWin >= 80 && game.result !== 'win' && game.result !== 'unfinished');
  const missedWins = games.reduce((sum, game) => sum + game.missedWins, 0);
  const missedMates = games.reduce((sum, game) => sum + game.missedMates, 0);
  const blunders = counts.blunder;
  const mistakesCount = counts.mistake;
  const blundersPerGame = games.length ? blunders / games.length : 0;
  const openingAccuracy = accuracyByPhase.opening;
  const endgameAccuracy = accuracyByPhase.endgame;
  const middlegameAccuracy = accuracyByPhase.middlegame;
  const resultRate = played.length ? (score / played.length) * 100 : 0;

  const focus = [];
  const push = (weight, title, body, metric) => focus.push({ weight, title, body, metric });

  if (blundersPerGame >= 0.7) {
    push(
      100 + blundersPerGame * 10,
      'Cut the one-move disasters',
      `${blunders} blunder${blunders === 1 ? '' : 's'} across ${games.length} game${
        games.length === 1 ? '' : 's'
      } (${round(blundersPerGame, 2)} per game) cost you more than any other habit. Before every capture, check and pawn move, ask what your opponent's reply does to your king and your loose pieces.`,
      `${blunders} blunders`,
    );
  } else if (mistakesCount > games.length) {
    push(
      80,
      'Slow down on the quiet moves',
      `${mistakesCount} mistakes this week, mostly in positions that looked calm. The pattern is drifting plans rather than tactical misses — pick one concrete plan per position and commit to it.`,
      `${mistakesCount} mistakes`,
    );
  }

  if (missedWins + missedMates + blownLeads.length > 0) {
    push(
      95 + (missedWins + missedMates) * 4,
      'Finish what you start',
      `${blownLeads.length} game${blownLeads.length === 1 ? '' : 's'} slipped after you had a winning position, with ${
        missedWins + missedMates
      } moment${missedWins + missedMates === 1 ? '' : 's'} where the win was on the board. When you are up material, trade pieces (not pawns), keep the king boxed in, and look for the simplest mate — not the prettiest.`,
      `${blownLeads.length} leads lost`,
    );
  }

  if (openingAccuracy != null && openingAccuracy < 82) {
    push(
      70 + (82 - openingAccuracy),
      'Make the first ten moves automatic',
      `Your opening accuracy was ${openingAccuracy}%. You are spending thinking time re-deriving lines you could know cold. Pick two openings per colour, learn the first 8–10 moves and the typical middlegame plan behind them.`,
      `${openingAccuracy}% opening`,
    );
  }

  if (endgameAccuracy != null && endgameAccuracy < 75 && games.length > 1) {
    push(
      65 + (75 - endgameAccuracy),
      'Practise the endgames you actually reach',
      `Endgame accuracy was ${endgameAccuracy}% — your weakest phase. Spend 15 minutes a week on king-and-pawn races and rook endings; that is where most of these games are being decided.`,
      `${endgameAccuracy}% endgame`,
    );
  }

  if (middlegameAccuracy != null && middlegameAccuracy < 74) {
    push(
      60,
      'Build middlegame plans, not just moves',
      `Middlegame accuracy was ${middlegameAccuracy}%. Before you move, name the weakness you are attacking. A plan you can say out loud beats a move that merely looks active.`,
      `${middlegameAccuracy}% middlegame`,
    );
  }

  // Always fill three slots: a week needs three things to work on, not one.
  if (focus.length < 3 && record.loss >= 2) {
    push(
      40,
      'Study the losses, not the wins',
      `You lost ${record.loss} game${record.loss === 1 ? '' : 's'} this week. Open each one and stop at the move where the game turned — before the blunder, when the plan was still unclear. That moment is the real lesson; the blunder is only the symptom.`,
      `${record.loss} losses`,
    );
  }

  if (focus.length < 3 && openings.length <= 2) {
    push(
      30,
      'Widen the opening map',
      `Only ${openings.length} opening${openings.length === 1 ? '' : 's'} showed up this week. Adding one more line per colour — and knowing the plan behind it — stops you improvising the first ten moves.`,
      `${openings.length} openings`,
    );
  }

  if (focus.length < 3 && accuracy >= 84 && resultRate < 65) {
    push(
      25,
      'Turn accuracy into points',
      `You played clean chess (${round(accuracy, 1)}% accuracy) but scored ${round(
        resultRate,
        0,
      )}%. That usually means cautious play in equal positions: when you are better, look for the second weakness, not the safe trade.`,
      `${round(accuracy, 1)}% accuracy`,
    );
  }

  const spares = [
    {
      weight: 20,
      title: 'Add one structured training block',
      body: 'Pick a single theme for the week — tactics, rook endings, or the middlegame plans of your main opening — and spend 15 focused minutes on it before you play. Depth on one idea beats a tour of five.',
      metric: 'weekly habit',
    },
    {
      weight: 15,
      title: 'Review before you queue again',
      body: 'Give each finished game ninety seconds: name the move you regret and the move you are proudest of. Two sentences per game is enough to stop the same mistake repeating next week.',
      metric: 'review habit',
    },
    {
      weight: 10,
      title: 'Protect your clock',
      body: 'Slow down on the three moves that decide a game: the first move after the opening, the first capture in a sharp position, and any move that leaves your king. Extra seconds there are worth more than speed anywhere else.',
      metric: 'time management',
    },
  ];

  for (const spare of spares) {
    if (focus.length >= 3) break;
    push(spare.weight, spare.title, spare.body, spare.metric);
  }

  focus.sort((a, b) => b.weight - a.weight);

  const strengths = [];
  if (counts.brilliant + counts.great > 0) {
    strengths.push(
      `${counts.brilliant + counts.great} brilliant/great moment${counts.brilliant + counts.great === 1 ? '' : 's'} — you found the hard move when it mattered.`,
    );
  }
  if (accuracy >= 82) strengths.push(`${round(accuracy, 1)}% average accuracy: your calculation held up under pressure.`);
  if (openingAccuracy != null && openingAccuracy >= 85)
    strengths.push(`Openings were sharp at ${openingAccuracy}% — you are leaving the book in good shape.`);
  if (conversionRate(record) >= 70 && record.win > 0)
    strengths.push(`You converted ${record.win} of ${record.win + record.draw + record.loss} finished games.`);
  if (!strengths.length) strengths.push('You put games on the board — the raw material for improvement is there.');

  const headline =
    record.win > record.loss
      ? `A winning week: ${record.win}W ${record.loss}L ${record.draw}D`
      : record.win === record.loss && record.win > 0
        ? `An even week: ${record.win}W ${record.loss}L ${record.draw}D`
        : played.length
          ? `A tough week: ${record.win}W ${record.loss}L ${record.draw}D`
          : 'No finished games this week';

  const summary =
    games.length === 0
      ? 'No rated games were found in that week. Pick another week or platform.'
      : `Across ${games.length} reviewed game${games.length === 1 ? '' : 's'} you averaged ${round(
          accuracy,
          1,
        )}% accuracy and scored ${round(resultRate, 0)}%. ${
          blundersPerGame >= 0.7
            ? 'The fastest gain available is blunder control.'
            : openingAccuracy != null && openingAccuracy < 82
              ? 'The quickest win is tightening up the opening.'
              : 'The margin is in converting small advantages.'
        }`;

  return {
    player,
    platform,
    from,
    to,
    depth,
    generatedAt: new Date().toISOString(),
    games: games.map((game) => ({
      id: game.id,
      color: game.color,
      opponent: game.opponent,
      opponentElo: game.opponentElo,
      result: game.result,
      accuracy: game.accuracy,
      grade: game.grade,
      opening: game.opening,
      date: game.date,
      url: game.url,
      peakWin: game.peakWin,
    })),
    totals: {
      games: games.length,
      finished: played.length,
      moves: totalMoves,
      record,
      score: round(score, 1),
      resultRate: round(resultRate, 0),
      accuracy: round(accuracy, 1),
      accuracyByPhase,
      counts,
      blundersPerGame: round(blundersPerGame, 2),
    },
    grade: gradeFor(accuracy),
    headline,
    summary,
    focus: focus.slice(0, 3).map(({ title, body, metric }) => ({ title, body, metric })),
    strengths,
    mistakes,
    openings,
    colorSplit,
    bestGame: bestGame ? pickGame(bestGame) : null,
    worstGame: worstGame ? pickGame(worstGame) : null,
  };
}

function conversionRate(record) {
  const finished = record.win + record.loss + record.draw;
  return finished ? (record.win / finished) * 100 : 0;
}

function pickGame(game) {
  return {
    id: game.id,
    opponent: game.opponent,
    accuracy: game.accuracy,
    result: game.result,
    opening: game.opening,
    date: game.date,
  };
}
