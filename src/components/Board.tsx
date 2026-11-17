import { FILES, boardFromFen, pieceImage, squareName, squareToPoint, uciToSquares } from '../lib/chess';
import type { Classification } from '../types';
import { CLASSIFICATION_META } from '../lib/chess';

interface BoardProps {
  fen: string;
  flipped?: boolean;
  lastMove?: string | null;
  bestMove?: string | null;
  showBest?: boolean;
  badge?: { square: string; classification: Classification } | null;
  checkSquare?: string | null;
}

function Arrow({ from, to, tone, flipped }: { from: string; to: string; tone: string; flipped: boolean }) {
  const a = squareToPoint(from, flipped);
  const b = squareToPoint(to, flipped);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const start = { x: a.x + ux * 3.4, y: a.y + uy * 3.4 };
  const tip = { x: b.x - ux * 1.4, y: b.y - uy * 1.4 };
  const base = { x: tip.x - ux * 9, y: tip.y - uy * 9 };
  const px = -uy;
  const py = ux;
  return (
    <g className={`board-arrow board-arrow--${tone}`}>
      <line x1={start.x} y1={start.y} x2={base.x} y2={base.y} />
      <polygon
        points={`${tip.x},${tip.y} ${base.x + px * 4.2},${base.y + py * 4.2} ${base.x - px * 4.2},${base.y - py * 4.2}`}
      />
    </g>
  );
}

export function Board({ fen, flipped = false, lastMove, bestMove, showBest = true, badge, checkSquare }: BoardProps) {
  const pieces = boardFromFen(fen);
  const last = uciToSquares(lastMove ?? null);
  const best = uciToSquares(bestMove ?? null);
  const turn = fen.split(' ')[1];

  // Walk the 64 display slots and look each square's piece up by its real
  // coordinates, so flipping the board never shifts a piece off its square.
  const visual = Array.from({ length: 64 }, (_, slot) => {
    const square = squareName(slot, flipped);
    const fileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
    const rankIndex = Number(square[1]) - 1;
    const piece = pieces[(7 - rankIndex) * 8 + fileIndex] ?? null;
    return { piece, square, fileIndex, rankIndex };
  });

  return (
    <div className="board-shell">
      <div className="board">
        {visual.map(({ piece, square, fileIndex, rankIndex }, visualIndex) => {
          const isLight = (fileIndex + rankIndex) % 2 === 1;
          const isLast = last && (square === last.from || square === last.to);
          const isBadge = badge?.square === square;
          const rowIndex = Math.floor(visualIndex / 8);
          return (
            <div
              key={square}
              className={[
                'square',
                isLight ? 'square--light' : 'square--dark',
                isLast ? 'square--last' : '',
                checkSquare === square ? 'square--check' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {piece && (
                <img
                  className={`piece${turn === 'w' ? ' piece--live' : ''}`}
                  src={pieceImage(piece)}
                  alt=""
                  draggable={false}
                />
              )}
              {fileIndex === 0 && <span className="coord coord--rank">{square[1]}</span>}
              {rowIndex === 7 && <span className="coord coord--file">{square[0]}</span>}
              {isBadge && badge && (
                <span className={`square-badge tone-${CLASSIFICATION_META[badge.classification].tone}`}>
                  {CLASSIFICATION_META[badge.classification].short}
                </span>
              )}
            </div>
          );
        })}
        <svg className="board-overlay" viewBox="0 0 100 100" aria-hidden="true">
          {showBest && best && <Arrow from={best.from} to={best.to} tone="best" flipped={flipped} />}
        </svg>
      </div>
      <div className="board-legend">
        <span>
          <i className="legend-line legend-line--best" /> Engine's pick
        </span>
        <span>
          <i className="legend-line legend-line--last" /> Last move
        </span>
      </div>
    </div>
  );
}
