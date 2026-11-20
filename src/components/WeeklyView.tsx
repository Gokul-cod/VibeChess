import { useMemo, useState } from 'react';
import { CLASSIFICATION_META, formatDate } from '../lib/chess';
import { runWeeklyReport, type WeekProgress } from '../lib/weekly';
import type { Classification, GameSummary, WeeklyGame, WeeklyReport } from '../types';
import { Cocoa } from './Coach';

interface WeeklyViewProps {
  onOpenGame: (game: GameSummary, depth: number) => void;
}

type Status = 'idle' | 'running' | 'done' | 'error';

const TALLY_ORDER: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced'];
const PHASES = ['opening', 'middlegame', 'endgame'] as const;
const DEPTH = 14;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekRange(offset: number) {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - offset * 7);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  return { from: isoDay(start), to: isoDay(end), start, end };
}

function rangeLabel(from: string, to: string) {
  const start = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  return `${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(
    undefined,
    { day: 'numeric', month: 'short', year: 'numeric' },
  )}`;
}

function accuracyTone(value: number) {
  if (value >= 90) return 'excellent';
  if (value >= 80) return 'good';
  if (value >= 70) return 'inaccuracy';
  if (value >= 55) return 'mistake';
  return 'blunder';
}

function resultLabel(result: WeeklyGame['result']) {
  if (result === 'win') return 'Win';
  if (result === 'loss') return 'Loss';
  if (result === 'draw') return 'Draw';
  return 'Unfinished';
}

export function WeeklyView({ onOpenGame }: WeeklyViewProps) {
  const [source, setSource] = useState<'chesscom' | 'lichess'>('chesscom');
  const [username, setUsername] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState<WeekProgress | null>(null);
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weeks = useMemo(() => [0, 1, 2].map((offset) => ({ offset, ...weekRange(offset) })), []);
  const current = weeks.find((week) => week.offset === weekOffset) ?? weeks[0];

  const run = async () => {
    if (!username.trim()) return;
    setStatus('running');
    setError(null);
    setReport(null);
    setProgress(null);
    try {
      const { report: next } = await runWeeklyReport({
        source,
        username: username.trim(),
        from: current.from,
        to: current.to,
        depth: DEPTH,
        onProgress: setProgress,
      });
      setReport(next);
      setStatus('done');
    } catch (runError) {
      setError((runError as Error).message);
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setReport(null);
    setProgress(null);
    setError(null);
  };

  if (status === 'running') {
    const pct = progress?.positions ? Math.round((progress.position / progress.positions) * 100) : 0;
    const overall = progress?.gameCount
      ? Math.round(((progress.gameIndex - 1 + (progress.positions ? progress.position / progress.positions : 0)) / progress.gameCount) * 100)
      : 0;
    return (
      <div className="weekly">
        <div className="weekly__loading panel">
          <Cocoa mood="thinking" size={128} />
          <h1>Building your week…</h1>
          <p className="weekly__loading-text">{progress?.label ?? 'Collecting games…'}</p>
          {progress?.stage === 'reviewing' && (
            <>
              <p className="weekly__loading-meta">
                Game {progress.gameIndex} of {progress.gameCount} · position {progress.position}/{progress.positions}
              </p>
              <div className="progress">
                <div className="progress__bar" style={{ width: `${Math.max(3, overall)}%` }} />
              </div>
              <p className="weekly__loading-hint">Stockfish 19 is running in this browser tab. Keep it open.</p>
              <div className="weekly__loading-sub">
                <div className="progress progress--slim">
                  <div className="progress__bar" style={{ width: `${Math.max(2, pct)}%` }} />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (status === 'done' && report) {
    return <WeeklyReportView report={report} onOpenGame={onOpenGame} onReset={reset} />;
  }

  return (
    <div className="weekly">
      <header className="weekly__intro">
        <p className="eyebrow">Weekly report</p>
        <h1>
          Your week in <em>one page</em>.
        </h1>
        <p className="lede">
          Pull every game you finished in the last seven days, review each one with Stockfish 19, and get a single
          diagnosis: what cost you points, what held up, and what to work on next.
        </p>
      </header>

      <section className="panel weekly__form">
        <div className="tabs" role="tablist" aria-label="Platform">
          {(['chesscom', 'lichess'] as const).map((option) => (
            <button
              key={option}
              role="tab"
              aria-selected={source === option}
              className={`tab${source === option ? ' is-active' : ''}`}
              onClick={() => setSource(option)}
            >
              {option === 'chesscom' ? 'Chess.com' : 'Lichess'}
            </button>
          ))}
        </div>

        <label className="field">
          <span>{source === 'chesscom' ? 'Chess.com username' : 'Lichess username'}</span>
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder={source === 'chesscom' ? 'hikaru' : 'DrNykterstein'}
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="weekly__weeks" role="radiogroup" aria-label="Week">
          {weeks.map((week, index) => (
            <button
              key={week.offset}
              role="radio"
              aria-checked={week.offset === weekOffset}
              className={`weekchip${week.offset === weekOffset ? ' is-active' : ''}`}
              onClick={() => setWeekOffset(week.offset)}
            >
              <span className="weekchip__label">
                {index === 0 ? 'Last 7 days' : index === 1 ? 'Week before' : 'Two weeks ago'}
              </span>
              <span className="weekchip__range">{rangeLabel(week.from, week.to)}</span>
            </button>
          ))}
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="weekly__actions">
          <button className="button button--primary" onClick={run} disabled={!username.trim()}>
            Build weekly report
          </button>
          <p className="weekly__hint">
            Up to 12 games · Stockfish 19 at depth {DEPTH} · a few minutes, entirely in your browser.
          </p>
        </div>
      </section>

      <section className="weekly__teaser">
        <div>
          <h2>What you get</h2>
          <ul>
            <li>Average accuracy and accuracy by phase across the week</li>
            <li>Every blunder and mistake, with the engine's move and what it cost</li>
            <li>How each opening actually scored for you</li>
            <li>Three concrete things to work on before your next session</li>
          </ul>
        </div>
        <Cocoa mood="neutral" size={112} />
      </section>
    </div>
  );
}

function WeeklyReportView({
  report,
  onOpenGame,
  onReset,
}: {
  report: WeeklyReport;
  onOpenGame: (game: GameSummary, depth: number) => void;
  onReset: () => void;
}) {
  const { totals } = report;
  const record = totals.record;
  const phaseValues = PHASES.map((phase) => ({ phase, value: totals.accuracyByPhase[phase] })).filter(
    (entry) => typeof entry.value === 'number',
  ) as { phase: (typeof PHASES)[number]; value: number }[];

  return (
    <div className="weekly weekly--report">
      <header className="weekly__report-head panel">
        <div className="weekly__report-copy">
          <p className="eyebrow">
            {report.platform === 'chesscom' ? 'Chess.com' : 'Lichess'} · {rangeLabel(report.from, report.to)}
          </p>
          <h1>
            {report.player} · <em>{report.headline}</em>
          </h1>
          <p className="lede">{report.summary}</p>
          <div className="weekly__report-actions">
            <button className="button button--ghost" onClick={onReset}>
              New report
            </button>
            <span className="weekly__depth">depth {report.depth} · {totals.moves} positions reviewed</span>
          </div>
        </div>
        <div className="scorecard">
          <div className={`scorecard__grade tone-bg-${accuracyTone(totals.accuracy)}`}>{report.grade}</div>
          <p className="scorecard__accuracy">{totals.accuracy}% accuracy</p>
          <p className="scorecard__record">
            {record.win}W · {record.loss}L · {record.draw}D
          </p>
          <p className="scorecard__meta">
            {totals.games} game{totals.games === 1 ? '' : 's'} · {totals.resultRate}% score
          </p>
        </div>
      </header>

      <section className="statgrid">
        <div className="stat">
          <span className="stat__label">Games reviewed</span>
          <strong className="stat__value">{totals.games}</strong>
          <span className="stat__hint">{totals.finished} finished</span>
        </div>
        <div className="stat">
          <span className="stat__label">Blunders / game</span>
          <strong className="stat__value">{totals.blundersPerGame}</strong>
          <span className="stat__hint">{totals.counts.blunder} total</span>
        </div>
        <div className="stat">
          <span className="stat__label">Mistakes</span>
          <strong className="stat__value">{totals.counts.mistake}</strong>
          <span className="stat__hint">{totals.counts.inaccuracy} inaccuracies</span>
        </div>
        <div className="stat">
          <span className="stat__label">Best phase</span>
          <strong className="stat__value stat__value--small">
            {phaseValues.length
              ? [...phaseValues].sort((a, b) => b.value - a.value)[0].phase
              : '—'}
          </strong>
          <span className="stat__hint">
            {phaseValues.length
              ? `${[...phaseValues].sort((a, b) => b.value - a.value)[0].value}% accuracy`
              : 'no data'}
          </span>
        </div>
      </section>

      <section className="panel focus">
        <div className="section-head">
          <h2>Focus for next week</h2>
          <p>Ranked by how many points this leak is costing you.</p>
        </div>
        <div className="focus__grid">
          {report.focus.map((item, index) => (
            <article className="focus__card" key={item.title}>
              <span className="focus__rank">{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <span className="focus__metric">{item.metric}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="weekly__columns">
        <section className="panel">
          <div className="section-head">
            <h2>Where the points went</h2>
            <p>Accuracy by phase, plus every grade you earned.</p>
          </div>
          <div className="weekly__phases">
            {phaseValues.map(({ phase, value }) => (
              <div className="phasebar" key={phase}>
                <span className="phasebar__label">{phase}</span>
                <div className="phasebar__track">
                  <div className={`phasebar__fill tone-bg-${accuracyTone(value)}`} style={{ width: `${Math.max(4, value)}%` }} />
                </div>
                <span className="phasebar__value">{Math.round(value)}%</span>
              </div>
            ))}
          </div>

          <div className="tally tally--weekly">
            <div className="tally__row is-current">
              <span className="tally__who">
                <span className="tally__swatch tally__swatch--white" /> as White
              </span>
              <div className="tally__chips">
                <span className="tally__chip">{report.colorSplit.white.games} games</span>
                <span className="tally__chip">{report.colorSplit.white.accuracy}%</span>
              </div>
            </div>
            <div className="tally__row">
              <span className="tally__who">
                <span className="tally__swatch tally__swatch--black" /> as Black
              </span>
              <div className="tally__chips">
                <span className="tally__chip">{report.colorSplit.black.games} games</span>
                <span className="tally__chip">{report.colorSplit.black.accuracy}%</span>
              </div>
            </div>
            <div className="tally__chips tally__chips--grades">
              {TALLY_ORDER.map((key) => (
                <span
                  key={key}
                  className={`tally__chip tone-${CLASSIFICATION_META[key].tone}`}
                  title={CLASSIFICATION_META[key].label}
                >
                  <i className={`dot tone-bg-${CLASSIFICATION_META[key].tone}`} />
                  {totals.counts[key]}
                </span>
              ))}
            </div>
            <p className="tally__legend">
              {TALLY_ORDER.map((key) => `${CLASSIFICATION_META[key].short} ${CLASSIFICATION_META[key].label}`).join('  •  ')}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="section-head">
            <h2>What held up</h2>
            <p>The parts of your game that are already working.</p>
          </div>
          <ul className="strengths">
            {report.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div className="weekly__extremes">
            {report.bestGame && (
              <div className="extreme">
                <span className="extreme__label">Best game</span>
                <p className="extreme__line">
                  {report.bestGame.accuracy}% vs {report.bestGame.opponent}
                </p>
                <span className="extreme__meta">
                  {resultLabel(report.bestGame.result)} · {report.bestGame.opening}
                </span>
              </div>
            )}
            {report.worstGame && (
              <div className="extreme">
                <span className="extreme__label">Roughest game</span>
                <p className="extreme__line">
                  {report.worstGame.accuracy}% vs {report.worstGame.opponent}
                </p>
                <span className="extreme__meta">
                  {resultLabel(report.worstGame.result)} · {report.worstGame.opening}
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <h2>Mistakes worth remembering</h2>
          <p>The six costliest moments of the week, with what the engine wanted.</p>
        </div>
        {report.mistakes.length ? (
          <div className="mistakelist">
            {report.mistakes.map((mistake, index) => {
              const game = report.games.find((entry) => entry.id === mistake.gameId);
              return (
                <div className="mistake" key={`${mistake.gameId}-${mistake.moveNumber}-${index}`}>
                  <span className={`dot tone-bg-${CLASSIFICATION_META[mistake.classification].tone}`} />
                  <div className="mistake__main">
                    <p className="mistake__move">
                      {mistake.moveNumber}
                      {mistake.color === 'w' ? '.' : '...'} {mistake.san}
                      <span className="mistake__tag">{CLASSIFICATION_META[mistake.classification].label}</span>
                      <span className="mistake__loss">−{Math.round(mistake.loss)}% win chance</span>
                    </p>
                    <p className="mistake__meta">
                      vs {mistake.opponent} · {mistake.opening}
                      {mistake.bestSan ? ` · engine wanted ${mistake.bestSan}` : ''}
                    </p>
                  </div>
                  {game?.summary && (
                    <button className="button button--ghost button--small" onClick={() => onOpenGame(game.summary!, DEPTH)}>
                      Review
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">No blunders or mistakes this week. Clean sheet.</p>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Openings you actually played</h2>
          <p>Frequency, results and accuracy by opening.</p>
        </div>
        <div className="openingtable">
          {report.openings.map((opening) => (
            <div className="openingrow" key={opening.name}>
              <span className="openingrow__name">{opening.name}</span>
              <span className="openingrow__meta">
                {opening.games} game{opening.games === 1 ? '' : 's'}
              </span>
              <span className="openingrow__score">
                {opening.score} / {opening.games}
              </span>
              <span className={`openingrow__acc tone-text-${accuracyTone(opening.accuracy)}`}>{opening.accuracy}%</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Every game this week</h2>
          <p>Open any of them for the full move-by-move review.</p>
        </div>
        <div className="weekgames">
          {report.games.map((game) => (
            <article className={`weekgame tone-edge-${game.result}`} key={game.id}>
              <span className={`weekgame__result tone-${game.result}`}>{resultLabel(game.result)}</span>
              <div className="weekgame__main">
                <p className="weekgame__line">
                  <span className="weekgame__color">{game.color === 'w' ? 'White' : 'Black'}</span> vs {game.opponent}
                  {game.opponentElo ? <span className="weekgame__elo"> {game.opponentElo}</span> : null}
                </p>
                <p className="weekgame__meta">
                  {game.opening} · {formatDate(game.date)}
                </p>
              </div>
              <span className={`weekgame__acc tone-text-${accuracyTone(game.accuracy)}`}>
                {game.accuracy}%
                <em>{game.grade}</em>
              </span>
              {game.summary && (
                <button className="button button--ghost button--small" onClick={() => onOpenGame(game.summary!, DEPTH)}>
                  Review
                </button>
              )}
            </article>
          ))}
        </div>
      </section>

      <p className="weekly__disclaimer">
        Analysis runs locally with Stockfish 19 (WebAssembly) at depth {report.depth}. Grades are computed from
        win-probability loss, so a blunder in a lost position costs less than one that throws a win.
      </p>
    </div>
  );
}
