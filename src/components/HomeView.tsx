import { useEffect, useRef, useState } from 'react';
import { loadPlayer, previewPgn } from '../lib/api';
import {
  formatDate,
  outcomeLabel,
  playerRating,
  relativeDay,
  timeControlLabel,
} from '../lib/chess';
import type { GameSummary, PlayerPayload, Source } from '../types';
import { Cocoa } from './Coach';

interface HomeViewProps {
  onStart: (game: GameSummary, depth: number) => void;
  engineMode?: 'server' | 'browser' | null;
}

type Tab = Exclude<Source, 'pgn'> | 'pgn';

const DEPTH_OPTIONS = [
  { value: 15, label: 'Quick', hint: '~2 min for a 90-move game' },
  { value: 18, label: 'Balanced', hint: '~4 min for a 90-move game' },
  { value: 21, label: 'Deep', hint: '~8 min for a 90-move game' },
];

export function HomeView({ onStart, engineMode }: HomeViewProps) {
  const [tab, setTab] = useState<Tab>('chesscom');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PlayerPayload | null>(null);
  const [depth, setDepth] = useState(18);
  const [pgnText, setPgnText] = useState('');
  const [imports, setImports] = useState<GameSummary[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Both deployments run the same engine in the visitor's browser.
  useEffect(() => {
    if (engineMode === 'browser') setDepth(18);
  }, [engineMode]);

  const search = async (source: 'chesscom' | 'lichess', name: string) => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const payload = await loadPlayer(source, name.trim());
      setData(payload);
      if (!payload.games.length) setError('No recent rated games found for that account.');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePgn = async (text: string) => {
    if (!text.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const games = await previewPgn(text);
      setImports(games);
      if (!games.length) setError('No games found in that PGN.');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setPgnText(text);
    await handlePgn(text);
  };

  return (
    <div className="home">
      <main className="home__main">
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">Game review · weekly reports · a coach who tells the truth</p>
            <h1>
              Find out what your <em>best move</em> really was.
            </h1>
            <p className="lede">
              Pull your games from Chess.com or Lichess, or drop in a PGN. Stockfish 19 grinds through
              every position, and Cocoa points out the misses, the saves, and the moment that decided it.
            </p>
            <ul className="hero__chips">
              <li>Import PGN</li>
              <li>Chess.com &amp; Lichess usernames</li>
              <li>Plain-English coaching</li>
            </ul>
          </div>
          <div className="hero__coach">
            <Cocoa mood="happy" size={104} />
            <div className="hero__bubble">
              <p className="hero__bubble-title">Cocoa, your house coach</p>
              <p>
                “Bring me a game. I will tell you where you were brilliant, where you nodded off, and
                exactly which move kept the win on the board.”
              </p>
            </div>
          </div>
        </section>

        <section className="panel search-panel">
          <div className="tabs" role="tablist" aria-label="Game source">
            <button
              role="tab"
              aria-selected={tab === 'chesscom'}
              className={`tab${tab === 'chesscom' ? ' is-active' : ''}`}
              onClick={() => {
                setTab('chesscom');
                setError(null);
                setData(null);
              }}
            >
              Chess.com
            </button>
            <button
              role="tab"
              aria-selected={tab === 'lichess'}
              className={`tab${tab === 'lichess' ? ' is-active' : ''}`}
              onClick={() => {
                setTab('lichess');
                setError(null);
                setData(null);
              }}
            >
              Lichess
            </button>
            <button
              role="tab"
              aria-selected={tab === 'pgn'}
              className={`tab${tab === 'pgn' ? ' is-active' : ''}`}
              onClick={() => {
                setTab('pgn');
                setError(null);
              }}
            >
              Import PGN
            </button>
          </div>

          {tab !== 'pgn' ? (
            <form
              className="search-row"
              onSubmit={(event) => {
                event.preventDefault();
                search(tab, username);
              }}
            >
              <div className="search-input">
                <span className="search-input__prefix">@{tab === 'lichess' ? 'lichess' : 'chess.com'}/</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder={tab === 'lichess' ? 'DrNykterstein' : 'hikaru'}
                  aria-label={`${tab} username`}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <button className="button button--primary" type="submit" disabled={loading || !username.trim()}>
                {loading ? 'Fetching…' : 'Find games'}
              </button>
            </form>
          ) : (
            <div className="pgn-import">
              <div
                className={`dropzone${dragging ? ' is-dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) void handleFile(file);
                }}
                onClick={() => fileInput.current?.click()}
              >
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pgn,text/plain"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                <p className="dropzone__title">Drop a .pgn file here</p>
                <p className="dropzone__hint">or click to browse — multiple games are supported</p>
              </div>
              <textarea
                className="pgn-textarea"
                value={pgnText}
                onChange={(event) => {
                  setPgnText(event.target.value);
                  setImports(null);
                }}
                placeholder={'…or paste PGN here\n\n[Event "Casual game"]\n[White "You"]\n[Black "Opponent"]\n\n1. e4 e5 2. Nf3 Nc6'}
                spellCheck={false}
              />
              <div className="pgn-actions">
                <button
                  className="button button--primary"
                  onClick={() => void handlePgn(pgnText)}
                  disabled={importing || !pgnText.trim()}
                >
                  {importing ? 'Reading PGN…' : 'Read PGN'}
                </button>
                {imports && <span className="pgn-actions__count">{imports.length} game{imports.length === 1 ? '' : 's'} ready</span>}
              </div>
            </div>
          )}

          <div className="depth-picker">
            <span className="depth-picker__label">Review depth</span>
            <div className="segmented">
              {DEPTH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  className={`segment${depth === option.value ? ' is-active' : ''}`}
                  onClick={() => setDepth(option.value)}
                  title={`Stockfish depth ${option.value} — ${option.hint}`}
                >
                  <strong>{option.label}</strong>
                  <span>d{option.value}</span>
                </button>
              ))}
            </div>
            {engineMode === 'browser' && (
              <span className="depth-picker__note">
                Runs on your device · ~1.8 MB engine download on first review
              </span>
            )}
          </div>

          {error && <p className="notice notice--error">{error}</p>}
        </section>

        {data && tab !== 'pgn' && (
          <section className="panel results">
            <div className="results__head">
              <div className="player">
                {data.player.avatar ? (
                  <img className="player__avatar" src={data.player.avatar} alt="" />
                ) : (
                  <span className="player__avatar player__avatar--fallback">
                    {data.player.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="player__name">
                    {data.player.title && <span className="player__title">{data.player.title}</span>}
                    {data.player.username}
                  </p>
                  <p className="player__sub">
                    {data.source === 'chesscom' ? 'Chess.com' : 'Lichess'}
                    {data.player.name ? ` · ${data.player.name}` : ''}
                    {data.player.followers != null ? ` · ${data.player.followers.toLocaleString()} followers` : ''}
                  </p>
                </div>
              </div>
              {data.player.ratings && (
                <div className="rating-chips">
                  {Object.entries(data.player.ratings)
                    .filter(([, value]) => value != null)
                    .map(([key, value]) => (
                      <span className="rating-chip" key={key}>
                        <span>{key}</span>
                        {value}
                      </span>
                    ))}
                </div>
              )}
              <a className="ghost-link" href={data.player.url} target="_blank" rel="noreferrer">
                Open profile ↗
              </a>
            </div>

            <div className="gamegrid">
              {data.games.map((game) => {
                const outcome = outcomeLabel(game.outcome);
                return (
                  <article className="gamecard" key={game.id}>
                    <span className={`gamecard__result tone-${game.outcome}`}>{outcome}</span>
                    <div className="gamecard__main">
                      <p className="gamecard__players">
                        <span className={game.playerColor === 'white' ? 'is-you' : ''}>{game.white}</span>
                        <span className="gamecard__rating">{playerRating(game.whiteElo)}</span>
                        <span className="gamecard__vs">vs</span>
                        <span className={game.playerColor === 'black' ? 'is-you' : ''}>{game.black}</span>
                        <span className="gamecard__rating">{playerRating(game.blackElo)}</span>
                      </p>
                      <p className="gamecard__meta">
                        <span>{game.opening ?? 'Unknown opening'}</span>
                        <span>·</span>
                        <span>{timeControlLabel(game)}</span>
                        <span>·</span>
                        <span title={formatDate(game.date)}>{relativeDay(game.date) || formatDate(game.date)}</span>
                      </p>
                    </div>
                    <button className="button button--ghost" onClick={() => onStart(game, depth)}>
                      Review
                      <span aria-hidden="true">→</span>
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {imports && tab === 'pgn' && (
          <section className="panel results">
            <div className="results__head">
              <div>
                <p className="player__name">Imported games</p>
                <p className="player__sub">Pick one to review — you can switch sides inside the review.</p>
              </div>
            </div>
            <div className="gamegrid">
              {imports.map((game) => (
                <article className="gamecard" key={game.id}>
                  <span className="gamecard__result tone-imported">PGN</span>
                  <div className="gamecard__main">
                    <p className="gamecard__players">
                      <span>{game.white}</span>
                      <span className="gamecard__rating">{playerRating(game.whiteElo)}</span>
                      <span className="gamecard__vs">vs</span>
                      <span>{game.black}</span>
                      <span className="gamecard__rating">{playerRating(game.blackElo)}</span>
                    </p>
                    <p className="gamecard__meta">
                      <span>{game.opening ?? 'Imported PGN'}</span>
                      <span>·</span>
                      <span>{game.result}</span>
                      {game.date && (
                        <>
                          <span>·</span>
                          <span>{formatDate(game.date)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <button className="button button--ghost" onClick={() => onStart(game, depth)}>
                    Review
                    <span aria-hidden="true">→</span>
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="panel explainer" id="how-it-works">
          <h2>How the review works</h2>
          <div className="explainer__grid">
            <div>
              <span className="step">01</span>
              <h3>Every position, checked</h3>
              <p>
                Stockfish 19 analyses each position with two candidate lines, at the depth you choose.
                Nothing is sampled, nothing is skipped.
              </p>
            </div>
            <div>
              <span className="step">02</span>
              <h3>Moves get graded</h3>
              <p>
                Win chances are compared before and after every move, so a blunder in a lost position is
                not punished like a blunder that throws a win.
              </p>
            </div>
            <div>
              <span className="step">03</span>
              <h3>Cocoa talks you through it</h3>
              <p>
                Each move gets a plain-English note: what the engine wanted, why yours was weaker, and
                which piece was left hanging.
              </p>
            </div>
          </div>
        </section>
      </main>

    </div>
  );
}
