/** PGN helpers shared by the Node server, the hosted API worker and the browser. */

export const DEPTHS = { quick: 12, balanced: 14, deep: 16 };
export const MAX_PLIES = 260;

export function splitGames(text) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const parts = [];
  let current = [];
  let seenMoves = false;
  for (const line of normalized.split('\n')) {
    const isHeader = /^\s*\[\s*\w+\s+"/.test(line);
    if (isHeader) {
      if (seenMoves && current.length) {
        parts.push(current.join('\n'));
        current = [];
        seenMoves = false;
      }
      current.push(line);
    } else {
      if (line.trim()) seenMoves = seenMoves || !!current.length;
      current.push(line);
    }
  }
  if (current.length) parts.push(current.join('\n'));
  return parts.map((part) => part.trim()).filter(Boolean);
}

export function parsePgnHeaders(pgn) {
  const headers = {};
  const headerRe = /\[\s*(\w+)\s+"([^"]*)"\s*\]/g;
  let match;
  while ((match = headerRe.exec(pgn))) {
    headers[match[1]] = match[2];
  }
  return headers;
}
