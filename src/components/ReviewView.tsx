import { useEffect, useRef, useState } from 'react';
import { AppearanceMenu } from './AppearanceMenu';
import { winPercent, CLASSIFICATION_META, formatEval, formatDate, accuracyTone, playerRating } from '../lib/chess';
import type { Classification, Color, ReviewSession } from '../types';
import { Board } from './Board';
import { Cocoa } from './Coach';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveList } from './MoveList';

interface ReviewViewProps {
  session: ReviewSession;
  onExit: () => void;
  onRerun: (depth: number) => void;
}

const DEPTHS = [
  { value: 12, label: 'Quick' },
  { value: 14, label: 'Balanced' },
  { value: 16, label: 'Deep' },
];

// Every grade a move can receive, so the tally accounts for every move in the game.
const COUNT_ORDER: Classification[] = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
  'forced',
];

function moveLabel(move: { moveNumber: number; color: Color; san: string }) {
  return `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`;
}

export function ReviewView({ session, onExit, onRerun }: ReviewViewProps) {
  const report = session.report;
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(session.game.playerColor === 'black');
  const [side, setSide] = useState<Color>(session.game.playerColor === 'black' ? 'b' : 'w');
  const [tab, setTab] = useState<'moves' | 'report'>('moves');
  const [showBest, setShowBest] = useState(true);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPly(0);
    setTab('moves');
    const nextFlipped = session.game.playerColor === 'black';
    setFlipped(nextFlipped);
    setSide(nextFlipped ? 'b' : 'w');
  }, [session.game.id, session.depth]);

  const total = report?.moves.length ?? 0;

  useEffect(() => {
    if (!report) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setPly((value) => Math.max(0, value - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setPly((value) => Math.min(total, value + 1));
      } else if (event.key === 'Home') {
        setPly(0);
      } else if (event.key === 'End') {
        setPly(total);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [report, total]);

  if (!report) {
    const progress = session.progress;
    const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="review review--state">
        <div className="panel loading-card">
          <Cocoa mood={session.error ? 'worried' : 'thinking'} size={140} />
          {session.error ? (
            <>
              <h2>The roast went cold</h2>
              <p className="loading-card__message">{session.error}</p>
            </>
          ) : (
            <>
              <h2>Roasting your game…</h2>
              <p className="loading-card__message">{progress?.message ?? 'Waking up Stockfish 19…'}</p>
              <div className="progress">
                <div className="progress__bar" style={{ width: `${Math.max(3, pct)}%` }} />
              </div>
              <p className="loading-card__meta">
                {progress ? `${progress.done} / ${progress.total} positions` : 'Preparing positions'} · depth {session.depth}
              </p>
            </>
          )}
          <div className="loading-card__actions">
            <button className="button button--ghost" onClick={onExit}>
              ← Back to games
            </button>
            {session.error && (
              <button className="button button--primary" onClick={() => onRerun(session.depth)}>
                Try again
              </button>
            )}
          </div>
          <p className="loading-card__footnote">
            {session.game.white} vs {session.game.black}
          </p>
        </div>
      </div>
    );
  }

  const currentMove = ply > 0 ? report.moves[ply - 1] : null;
  const nextMove = ply < total ? report.moves[ply] : null;
  const fen = currentMove ? currentMove.fenAfter : report.meta.startFen;
  const evalCp = currentMove ? currentMove.evalCpAfter : report.moves[0]?.evalCpBefore ?? 0;
  const evalMate = currentMove ? currentMove.mateAfter : report.moves[0]?.mateBefore ?? null;
  const bestUci = nextMove?.bestUci ?? null;
  const graphValues = [winPercent(report.moves[0]?.evalCpBefore ?? 0, report.moves[0]?.mateBefore ?? null)];
  for (const move of report.moves) graphValues.push(winPercent(move.evalCpAfter, move.mateAfter));

  const playerReport = report.players[side];
  const coach = currentMove
    ? currentMove.coach
    : {
        title: 'Let us look at this one',
        mood: 'happy' as const,
        body: `${report.meta.white}${report.meta.whiteElo ? ` (${report.meta.whiteElo})` : ''} vs ${
          report.meta.black
        }${report.meta.blackElo ? ` (${report.meta.blackElo})` : ''}. ${
          report.meta.opening ? `${report.meta.opening}, ` : ''
        }${report.meta.result}. Use ← → or the move list, and I will flag the moments that mattered.`,
      };
  // Count straight from the reviewed moves so the tally always matches the move list.
  const tallyFor = (color: Color) => {
    const counts = Object.fromEntries(COUNT_ORDER.map((key) => [key, 0])) as Record<Classification, number>;
    for (const move of report.moves) {
      if (move.color === color) counts[move.classification] += 1;
    }
    return counts;
  };
  const badgeSquare = currentMove ? currentMove.uci.slice(2, 4) : null;
  const keyMomentPlies = [...report.keyMoments].sort((a, b) => a - b);
  const nextKeyMoment = keyMomentPlies.find((value) => value > ply) ?? keyMomentPlies[0] ?? null;
  const checkSquare = currentMove?.isCheck
    ? fen.split(' ')[1] === 'w'
      ? findKingSquare(fen, 'K')
      : findKingSquare(fen, 'k')
    : null;

  return (
    <div className="review">
      <header className="reviewbar">
        <button className="back" onClick={onExit}>
          <span aria-hidden="true">←</span> All games
        </button>
        <div className="reviewbar__title">
          <p className="reviewbar__players">
            {report.meta.white}
            <span className="reviewbar__elo">{playerRating(report.meta.whiteElo)}</span>
            <span className="reviewbar__vs">vs</span>
            {report.meta.black}
            <span className="reviewbar__elo">{playerRating(report.meta.blackElo)}</span>
          </p>
          <p className="reviewbar__meta">
            {report.meta.opening ?? 'Unknown opening'}
            {report.meta.eco ? ` · ${report.meta.eco}` : ''} · {formatDate(report.meta.date)} · {report.meta.result}
          </p>
        </div>
        <div className="reviewbar__actions">
          <span className="pill pill--engine">
            {report.engine.name} · d{report.engine.depth}
          </span>
          <div className="segmented segmented--tiny">
            {DEPTHS.map((option) => (
              <button
                key={option.value}
                className={`segment${report.engine.depth === option.value ? ' is-active' : ''}`}
                onClick={() => onRerun(option.value)}
                title={`Re-run at depth ${option.value}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <AppearanceMenu />
        </div>
      </header>

      <div className="review__grid">
        <section className="review__left">
          <div className="coach-dock">
            <section className={`panel coach-card mood-${coach.mood}`}>
              <div className="coach-card__avatar">
                <Cocoa mood={coach.mood} size={88} />
              </div>
              <div className="coach-card__body">
                <div className="coach-card__head">
                  <div>
                    <p className="coach-card__name">Cocoa</p>
                    <p className="coach-card__role">
                      {currentMove ? `on move ${currentMove.moveNumber}` : 'house coach'}
                    </p>
                  </div>
                  {currentMove && (
                    <span className={`chip tone-${CLASSIFICATION_META[currentMove.classification].tone}`}>
                      {CLASSIFICATION_META[currentMove.classification].short}{' '}
                      {CLASSIFICATION_META[currentMove.classification].label}
                    </span>
                  )}
                </div>
                <h3 className="coach-card__title">{coach.title}</h3>
                <p className="coach-card__text">{coach.body}</p>
                {currentMove && (
                  <div className="coach-card__stats">
                    <span>
                      Eval <strong>{formatEval(currentMove.evalCpAfter, currentMove.mateAfter)}</strong>
                    </span>
                    <span>
                      Win chance <strong>{Math.round(currentMove.wpAfter)}%</strong>
                    </span>
                    {currentMove.bestSan && currentMove.bestSan !== currentMove.san && (
                      <span>
                        Best <strong>{currentMove.bestSan}</strong>
                      </span>
                    )}
                  </div>
                )}
                {currentMove?.tags.includes('missedMate') && <span className="tag tag--alarm">Missed mate</span>}
                {currentMove?.tags.includes('missedWin') && <span className="tag tag--warn">Missed win</span>}
                {currentMove?.tags.includes('sacrifice') && <span className="tag tag--good">Material sacrifice</span>}
              </div>
            </section>
          </div>

          <div className="board-row" ref={boardRef}>
            <EvalBar cp={evalCp} mate={evalMate} label={formatEval(evalCp, evalMate)} />
            <Board
              fen={fen}
              flipped={flipped}
              lastMove={currentMove?.uci ?? null}
              bestMove={showBest ? bestUci : null}
              badge={badgeSquare && currentMove ? { square: badgeSquare, classification: currentMove.classification } : null}
              checkSquare={checkSquare}
            />
          </div>

          <div className="board-controls">
            <div className="nav">
              <button className="nav__button" onClick={() => setPly(0)} disabled={ply === 0} title="Start">
                ⏮
              </button>
              <button className="nav__button" onClick={() => setPly(Math.max(0, ply - 1))} disabled={ply === 0} title="Previous move">
                ◀
              </button>
              <span className="nav__label">
                {currentMove ? moveLabel(currentMove) : 'Start position'}
                <em>{ply} / {total}</em>
              </span>
              <button
                className="nav__button"
                onClick={() => setPly(Math.min(total, ply + 1))}
                disabled={ply === total}
                title="Next move"
              >
                ▶
              </button>
              <button className="nav__button" onClick={() => setPly(total)} disabled={ply === total} title="End">
                ⏭
              </button>
            </div>
            <div className="nav__extra">
              <button
                className={`toggle${showBest ? ' is-on' : ''}`}
                onClick={() => setShowBest((value) => !value)}
                title="Show the engine's move for this position"
              >
                <span className="toggle__dot" /> Engine arrow
              </button>
              <button className="toggle" onClick={() => setFlipped((value) => !value)}>
                <span aria-hidden="true">⇅</span> Flip
              </button>
              {nextKeyMoment != null && (
                <button className="toggle toggle--accent" onClick={() => setPly(nextKeyMoment)}>
                  ⚑ Turning point
                </button>
              )}
            </div>
          </div>

          <EvalGraph values={graphValues} current={ply} keyMoments={report.keyMoments} onSeek={setPly} />

          <div className="board-caption">
            <span className={`dot tone-bg-${currentMove ? CLASSIFICATION_META[currentMove.classification].tone : 'best'}`} />
            {currentMove ? (
              <p>
                {currentMove.color === 'w' ? report.meta.white : report.meta.black} played{' '}
                <strong>{currentMove.san}</strong> — {CLASSIFICATION_META[currentMove.classification].label.toLowerCase()}
                {currentMove.loss >= 0.2 ? `, ${currentMove.loss}% of the winning chances gone` : ''}.
                {currentMove.bestSan && currentMove.bestSan !== currentMove.san && currentMove.classification !== 'forced'
                  ? ` Engine preferred ${currentMove.bestSan}.`
                  : ''}
              </p>
            ) : (
              <p>
                Starting position. {report.moves[0]?.bestSan ? `Stockfish likes ${report.moves[0].bestSan} here.` : ''}
              </p>
            )}
          </div>
        </section>

        <aside className="review__side">
          <div className="tabs tabs--side" role="tablist">
            <button
              role="tab"
              aria-selected={tab === 'moves'}
              className={`tab${tab === 'moves' ? ' is-active' : ''}`}
              onClick={() => setTab('moves')}
            >
              Moves
            </button>
            <button
              role="tab"
              aria-selected={tab === 'report'}
              className={`tab${tab === 'report' ? ' is-active' : ''}`}
              onClick={() => setTab('report')}
            >
              Report card
            </button>
          </div>

          {tab === 'moves' ? (
            <MoveList moves={report.moves} current={ply} onSelect={setPly} />
          ) : (
            <div className="reportpanel">
              <div className="side-toggle">
                {(['w', 'b'] as Color[]).map((color) => {
                  const entry = report.players[color];
                  return (
                    <button
                      key={color}
                      className={`side-toggle__btn${side === color ? ' is-active' : ''}`}
                      onClick={() => setSide(color)}
                    >
                      <span className="side-toggle__color">{color === 'w' ? 'White' : 'Black'}</span>
                      <span className="side-toggle__name">{entry.name}</span>
                      <span className={`side-toggle__acc tone-text-${accuracyTone(entry.accuracy)}`}>{entry.accuracy}%</span>
                    </button>
                  );
                })}
              </div>

              <div className="grade">
                <div className={`grade__badge tone-bg-${accuracyTone(playerReport.accuracy)}`}>{playerReport.grade}</div>
                <div>
                  <p className="grade__headline">{playerReport.summary.headline}</p>
                  <p className="grade__sub">
                    {playerReport.accuracy}% accuracy · {playerReport.summary.resultLine}
                  </p>
                </div>
              </div>

              <div className="phasebars">
                {(['opening', 'middlegame', 'endgame'] as const).map((phase) => {
                  const value = playerReport.accuracyByPhase[phase];
                  if (value == null) return null;
                  return (
                    <div className="phasebar" key={phase}>
                      <span className="phasebar__label">{phase}</span>
                      <div className="phasebar__track">
                        <div
                          className={`phasebar__fill tone-bg-${accuracyTone(value)}`}
                          style={{ width: `${Math.max(4, value)}%` }}
                        />
                      </div>
                      <span className="phasebar__value">{Math.round(value)}%</span>
                    </div>
                  );
                })}
              </div>

              <div className="tally">
                {(['w', 'b'] as Color[]).map((color) => {
                  const entry = report.players[color];
                  const tallies = tallyFor(color);
                  const isCurrent = side === color;
                  return (
                    <div className={`tally__row${isCurrent ? ' is-current' : ''}`} key={color}>
                      <button
                        className="tally__who"
                        onClick={() => setSide(color)}
                        aria-pressed={isCurrent}
                        title={`Show ${entry.name}'s report`}
                      >
                        <span className={`tally__swatch tally__swatch--${color === 'w' ? 'white' : 'black'}`} />
                        {entry.name}
                      </button>
                      <div className="tally__chips">
                        {COUNT_ORDER.map((key) => (
                          <span
                            key={key}
                            className={`tally__chip tone-${CLASSIFICATION_META[key].tone}`}
                            title={`${CLASSIFICATION_META[key].label}: ${tallies[key]}`}
                          >
                            <i className={`dot tone-bg-${CLASSIFICATION_META[key].tone}`} />
                            {tallies[key]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <p className="tally__legend">
                  {COUNT_ORDER.map((key) => `${CLASSIFICATION_META[key].short} ${CLASSIFICATION_META[key].label}`).join(
                    '  •  ',
                  )}
                </p>
              </div>

              <div className="takeaways">
                <h4>What to work on</h4>
                {playerReport.summary.takeaways.map((item) => (
                  <div className="takeaway" key={item.title}>
                    <p className="takeaway__title">{item.title}</p>
                    <p className="takeaway__body">{item.body}</p>
                  </div>
                ))}
              </div>

              {keyMomentPlies.length > 0 && (
                <div className="turningpoints">
                  <h4>Turning points</h4>
                  {[...report.keyMoments]
                    .sort((a, b) => a - b)
                    .map((momentPly) => {
                      const move = report.moves[momentPly - 1];
                      if (!move) return null;
                      return (
                        <button key={momentPly} className="turningpoint" onClick={() => setPly(momentPly)}>
                          <span className={`dot tone-bg-${CLASSIFICATION_META[move.classification].tone}`} />
                          <span className="turningpoint__move">{moveLabel(move)}</span>
                          <span className="turningpoint__label">
                            {CLASSIFICATION_META[move.classification].label} · {move.coach.title}
                          </span>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function findKingSquare(fen: string, king: string): string | null {
  const rows = fen.split(' ')[0].split('/');
  for (let row = 0; row < 8; row++) {
    let file = 0;
    for (const char of rows[row]) {
      if (/\d/.test(char)) {
        file += Number(char);
      } else {
        if (char === king) return `${'abcdefgh'[file]}${8 - row}`;
        file += 1;
      }
    }
  }
  return null;
}
