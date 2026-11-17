import { useEffect, useRef } from 'react';
import { CLASSIFICATION_META, formatEval } from '../lib/chess';
import type { ReviewedMove } from '../types';

interface MoveListProps {
  moves: ReviewedMove[];
  current: number;
  onSelect: (ply: number) => void;
}

export function MoveList({ moves, current, onSelect }: MoveListProps) {
  const activeRef = useRef<HTMLButtonElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // Scroll only the move list itself. scrollIntoView() also scrolls the page,
  // which yanked the view away from the board on mobile.
  useEffect(() => {
    const body = bodyRef.current;
    const active = activeRef.current;
    if (!body || !active) return;
    const bodyRect = body.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < bodyRect.top) {
      body.scrollTop += activeRect.top - bodyRect.top - 6;
    } else if (activeRect.bottom > bodyRect.bottom) {
      body.scrollTop += activeRect.bottom - bodyRect.bottom + 6;
    }
  }, [current]);

  const rows: { number: number; white?: ReviewedMove; black?: ReviewedMove }[] = [];
  for (const move of moves) {
    const last = rows[rows.length - 1];
    if (move.color === 'w' || !last) {
      rows.push({ number: move.moveNumber, white: move.color === 'w' ? move : undefined, black: move.color === 'b' ? move : undefined });
    } else {
      last.black = move;
    }
  }

  return (
    <div className="movelist">
      <div className="movelist__head">
        <span>Move</span>
        <span>White</span>
        <span>Black</span>
      </div>
      <div className="movelist__body" ref={bodyRef}>
        {rows.map((row) => (
          <div className="movelist__row" key={`${row.number}-${row.white?.ply ?? row.black?.ply}`}>
            <span className="movelist__number">{row.number}.</span>
            {[row.white, row.black].map((move, index) =>
              move ? (
                <button
                  key={move.ply}
                  ref={move.ply === current ? activeRef : null}
                  className={`movelist__move${move.ply === current ? ' is-active' : ''}`}
                  onClick={() => onSelect(move.ply)}
                  title={`${CLASSIFICATION_META[move.classification].label} · ${move.loss}% win chance lost`}
                >
                  <i className={`dot tone-bg-${CLASSIFICATION_META[move.classification].tone}`} />
                  <span className="movelist__san">{move.san}</span>
                  <span className="movelist__eval">{formatEval(move.evalCpAfter, move.mateAfter)}</span>
                </button>
              ) : (
                <span key={`empty-${index}`} className="movelist__empty" />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
