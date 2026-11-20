/**
 * Accuracy maths, matching the published Lichess definitions so a CocoaChess
 * score and a Lichess score for the same game land in the same place.
 *
 * https://lichess.org/page/accuracy
 * https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/AccuracyPercent.scala
 *
 * Per move:  accuracy = 103.1668 * exp(-0.04354 * (win%Before - win%After)) - 3.1669
 * Per game:  the mean of the volatility-weighted mean and the harmonic mean.
 */

/** Lichess win probability for a centipawn score, 0–100. */
export function winPercentFromCp(cp) {
  const capped = Math.max(-1000, Math.min(1000, Number.isFinite(cp) ? cp : 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * capped)) - 1);
}

/** Win probability for a score that may be mate. Mate is a certain win/loss. */
export function winPercentFromScore(cp, mate) {
  if (mate != null) return mate > 0 ? 100 : 0;
  return winPercentFromCp(cp ?? 0);
}

/**
 * Accuracy of one move, from the mover's win probability before and after it.
 * Includes Lichess's +1 uncertainty bonus.
 */
export function moveAccuracy(beforeMover, afterMover) {
  if (afterMover >= beforeMover) return 100;
  const drop = Math.max(0, beforeMover - afterMover);
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * drop) - 3.166924740191411;
  return Math.min(100, Math.max(0, raw + 1));
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function weightedMean(pairs) {
  let total = 0;
  let weights = 0;
  for (const [value, weight] of pairs) {
    total += value * weight;
    weights += weight;
  }
  return weights > 0 ? total / weights : 0;
}

function harmonicMean(values) {
  if (!values.length) return 100;
  const inverse = values.reduce((sum, value) => sum + 1 / Math.max(value, 0.1), 0);
  return inverse > 0 ? values.length / inverse : 0;
}

/**
 * Volatility windows: a move in a stretch where the evaluation swung a lot
 * counts for more than a move in a quiet stretch.
 */
function volatilityWeights(winPercents) {
  const positions = winPercents.length;
  const windowSize = clamp(Math.floor((positions - 1) / 10), 2, 8);
  const windows = [];
  const head = Math.max(0, Math.min(windowSize, positions) - 2);
  for (let i = 0; i < head; i++) windows.push(winPercents.slice(0, windowSize));
  const limit = positions - windowSize + 1;
  for (let i = 0; i < limit; i++) windows.push(winPercents.slice(i, i + windowSize));
  return windows.map((window) => clamp(standardDeviation(window), 0.5, 12));
}

/**
 * Game accuracy per side.
 *
 * @param {number[]} winPercents white-POV win chance after each position,
 *   starting with the initial position (length = moves + 1)
 * @param {('w'|'b')[]} colors mover colour for each move
 * @returns {{ w: number, b: number, perMove: number[] }}
 */
export function gameAccuracy(winPercents, colors) {
  if (winPercents.length < 2) return { w: 100, b: 100, perMove: [] };
  const weights = volatilityWeights(winPercents);
  const perMove = [];
  const weighted = { w: [], b: [] };
  const plain = { w: [], b: [] };

  for (let i = 0; i < colors.length; i++) {
    const color = colors[i];
    const beforeWhite = winPercents[i];
    const afterWhite = winPercents[i + 1];
    if (beforeWhite == null || afterWhite == null) continue;
    const beforeMover = color === 'w' ? beforeWhite : 100 - beforeWhite;
    const afterMover = color === 'w' ? afterWhite : 100 - afterWhite;
    const accuracy = moveAccuracy(beforeMover, afterMover);
    perMove.push(accuracy);
    const weight = weights[i] ?? 1;
    weighted[color].push([accuracy, weight]);
    plain[color].push(accuracy);
  }

  const sideAccuracy = (color) =>
    plain[color].length
      ? (weightedMean(weighted[color]) + harmonicMean(plain[color])) / 2
      : 100;

  return { w: sideAccuracy('w'), b: sideAccuracy('b'), perMove };
}
