import { useState, type FormEvent } from 'react';
import { signIn, signUp } from '../lib/auth';
import type { AuthUser } from '../types';
import { Cocoa } from './Coach';
import { ReportIssue } from './ReportIssue';
import { Brand } from './Shell';

interface AuthViewProps {
  onAuthenticated: (user: AuthUser) => void;
  onPrivacy: () => void;
  reason?: string | null;
}

type Mode = 'login' | 'signup';

export function AuthView({ onAuthenticated, onPrivacy, reason }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = mode === 'login' ? await signIn(email.trim(), password) : await signUp(name.trim(), email.trim(), password);
      onAuthenticated(user);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  return (
    <div className="auth">
      <section className="auth__pitch">
        <Brand tagline="your chess week, reviewed" />
        <div className="auth__pitch-body">
          <p className="eyebrow">Game review · weekly report · honest coaching</p>
          <h1>
            See the <em>week</em>, not just the game.
          </h1>
          <p className="lede">
            CocoaChess pulls every game you played on Chess.com or Lichess, runs Stockfish 19 over each one and
            tells you what actually cost you points — then gives you three things to work on.
          </p>
          <ul className="auth__list">
            <li>
              <strong>Weekly report.</strong> A full review of the week: accuracy, phase grades, openings, the
              mistakes that mattered.
            </li>
            <li>
              <strong>Single game review.</strong> Move by move, with the engine's pick and a plain-English
              explanation.
            </li>
            <li>
              <strong>Runs on your device.</strong> The engine is WebAssembly in your browser; your games are not
              uploaded for analysis.
            </li>
          </ul>
          <div className="auth__coach">
            <Cocoa mood="happy" size={92} />
            <p className="auth__bubble">
              “Bring me the whole week. One game is a story; seven games are a pattern.”
            </p>
          </div>
        </div>
      </section>

      <section className="auth__panel">
        <div className="auth__card">
          <div className="tabs" role="tablist" aria-label="Account">
            <button
              role="tab"
              aria-selected={mode === 'login'}
              className={`tab${mode === 'login' ? ' is-active' : ''}`}
              onClick={() => switchMode('login')}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === 'signup'}
              className={`tab${mode === 'signup' ? ' is-active' : ''}`}
              onClick={() => switchMode('signup')}
            >
              Create account
            </button>
          </div>

          <h2 className="auth__title">{mode === 'login' ? 'Welcome back' : 'Make an account'}</h2>
          <p className="auth__sub">
            {mode === 'login'
              ? 'Sign in to review games and build your weekly report.'
              : 'One account for your game reviews and weekly reports.'}
          </p>

          {reason && <p className="auth__notice">{reason}</p>}

          <form onSubmit={submit} className="auth__form">
            {mode === 'signup' && (
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Morphy"
                  required
                  minLength={2}
                  maxLength={60}
                />
              </label>
            )}
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'login' ? 'Your password' : 'At least 8 characters'}
                required
                minLength={8}
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <button className="button button--primary button--block" type="submit" disabled={busy}>
              {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="auth__legal">
            By continuing you agree to our{' '}
            <button className="inline-link" type="button" onClick={onPrivacy}>
              privacy policy
            </button>
            . We store your name, email and a password hash — nothing else.
          </p>

          <p className="auth__legal">
            Trouble signing in? <ReportIssue className="inline-link" label="Report an issue" />
          </p>
        </div>
      </section>
    </div>
  );
}
