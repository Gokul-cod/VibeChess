import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthView } from './components/AuthView';
import { HomeView } from './components/HomeView';
import { PrivacyView } from './components/PrivacyView';
import { ReviewView } from './components/ReviewView';
import { SiteFooter, TopBar, type AppView } from './components/Shell';
import { WeeklyView } from './components/WeeklyView';
import { fetchHealth, startReview as requestReview, streamReview } from './lib/api';
import { fetchMe, signOut } from './lib/auth';
import type { AuthUser, GameSummary, ReviewSession } from './types';

type EngineMode = 'server' | 'browser';

export default function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [view, setView] = useState<AppView>('home');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [session, setSession] = useState<ReviewSession | null>(null);
  const [engineMode, setEngineMode] = useState<EngineMode | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    let alive = true;
    fetchMe().then((next) => {
      if (alive) setUser(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    // `?engine=wasm` forces the browser engine, handy for testing the hosted path locally.
    const forced = new URLSearchParams(window.location.search).get('engine');
    if (forced === 'wasm') {
      setEngineMode('browser');
      return () => {
        alive = false;
      };
    }
    fetchHealth()
      .then((health) => {
        if (alive) setEngineMode(health.engine?.ready ? 'server' : 'browser');
      })
      .catch(() => {
        if (alive) setEngineMode('browser');
      });
    return () => {
      alive = false;
    };
  }, []);

  const start = useCallback(
    async (game: GameSummary, depth: number) => {
      const id = ++runId.current;
      unsubscribe.current?.();
      unsubscribe.current = null;
      setSession({ game, depth });
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });

      const mode = engineMode ?? 'browser';

      if (mode === 'browser') {
        setSession({ game, depth, progress: { done: 0, total: 1, message: 'Loading Stockfish 19 (WASM)…' } });
        try {
          const { runLocalReview } = await import('./lib/localReview');
          const report = await runLocalReview({
            pgn: game.pgn,
            depth,
            onProgress: async (done, total) => {
              if (runId.current !== id) return;
              setSession((current) =>
                current
                  ? {
                      ...current,
                      progress: {
                        done,
                        total,
                        message:
                          done === 0
                            ? 'Warming up the engine in your browser…'
                            : 'Grinding through every position on your device…',
                      },
                    }
                  : current,
              );
            },
          });
          if (runId.current !== id) return;
          setSession((current) => (current ? { ...current, report, progress: undefined, error: undefined } : current));
        } catch (error) {
          if (runId.current !== id) return;
          setSession((current) =>
            current ? { ...current, error: error instanceof Error ? error.message : 'The review failed.' } : current,
          );
        }
        return;
      }

      try {
        const { jobId } = await requestReview(game.pgn, depth);
        if (runId.current !== id) return;
        setSession((current) =>
          current && current.game.id === game.id && current.depth === depth ? { ...current, jobId } : current,
        );
        unsubscribe.current = streamReview(jobId, (event) => {
          if (runId.current !== id) return;
          if (event.type === 'progress') {
            setSession((current) =>
              current
                ? { ...current, progress: { done: event.done, total: event.total, message: event.message } }
                : current,
            );
          } else if (event.type === 'done') {
            setSession((current) => (current ? { ...current, report: event.report, progress: undefined } : current));
          } else {
            setSession((current) => (current ? { ...current, error: event.message } : current));
          }
        });
      } catch (error) {
        if (runId.current !== id) return;
        setSession((current) => (current ? { ...current, error: (error as Error).message } : current));
      }
    },
    [engineMode],
  );

  const exit = useCallback(() => {
    runId.current += 1;
    unsubscribe.current?.();
    unsubscribe.current = null;
    void import('./lib/localReview').then((module) => module.cancelLocalReview());
    setSession(null);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut().catch(() => undefined);
    runId.current += 1;
    setSession(null);
    setUser(null);
    setView('home');
  }, []);

  useEffect(
    () => () => {
      unsubscribe.current?.();
    },
    [],
  );

  if (user === undefined) {
    return (
      <div className="boot">
        <div className="boot__mark" aria-hidden="true" />
        <p>Warming up VibeChess…</p>
      </div>
    );
  }

  if (showPrivacy) {
    return <PrivacyView onBack={() => setShowPrivacy(false)} />;
  }

  if (!user) {
    return (
      <AuthView
        onAuthenticated={(next) => {
          setUser(next);
          setView('home');
        }}
        onPrivacy={() => setShowPrivacy(true)}
        reason={new URLSearchParams(window.location.search).get('signedout') ? 'You have been signed out.' : null}
      />
    );
  }

  return (
    <div className="app">
      <TopBar
        view={view}
        onNavigate={(next) => {
          setView(next);
          window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
        }}
        user={user}
        onSignOut={() => void handleSignOut()}
      />
      <div className={session ? 'view view--hidden' : 'view'}>
        {view === 'weekly' ? (
          <WeeklyView onOpenGame={start} />
        ) : (
          <HomeView onStart={start} engineMode={engineMode} />
        )}
      </div>
      {session && (
        <ReviewView
          key={`${session.game.id}-${session.depth}`}
          session={session}
          onExit={exit}
          onRerun={(depth) => void start(session.game, depth)}
        />
      )}
      <SiteFooter onPrivacy={() => setShowPrivacy(true)} engineMode={engineMode} userEmail={user?.email ?? null} />
    </div>
  );
}
