import { useState, type FormEvent } from 'react';
import { signIn, signUp, verifyTwoFactor } from '../lib/auth';
import type { AuthUser } from '../types';
import { AppearanceMenu } from './AppearanceMenu';
import { Cocoa } from './Coach';
import { ReportIssue } from './ReportIssue';
import { Brand } from './Shell';

interface AuthViewProps {
  onAuthenticated: (user: AuthUser) => void;
  onPrivacy: () => void;
  onClose?: () => void;
  reason?: string | null;
}

type Mode = 'login' | 'signup';

export function AuthView({ onAuthenticated, onPrivacy, onClose, reason }: AuthViewProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<{ ticket: string; hint: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (pending) {
        onAuthenticated(await verifyTwoFactor(pending.ticket, code.trim()));
        return;
      }
      if (mode === 'login') {
        const result = await signIn(email.trim(), password);
        if ('twoFactor' in result) {
          setPending({ ticket: result.ticket, hint: result.hint });
          setCode('');
          return;
        }
        onAuthenticated(result.user);
        return;
      }
      onAuthenticated(await signUp(name.trim(), email.trim(), password));
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

  const restart = () => {
    setPending(null);
    setCode('');
    setPassword('');
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
        <div className="auth__appearance">
          <AppearanceMenu />
        </div>
        <div className="auth__card">
          {onClose && (
            <button className="inline-link auth__back" type="button" onClick={onClose}>
              ← Back to the site
            </button>
          )}
          <p className="auth__optional">Signing in is optional — everything on the site works without an account.</p>
          {pending ? (
            <>
              <p className="eyebrow auth__step">Step 2 of 2 · one-time code</p>
              <h2 className="auth__title">Enter your code</h2>
              <p className="auth__sub">
                Two-factor authentication is on for <strong>{pending.hint}</strong>. Open your authenticator app and
                enter the 6-digit code, or use one of your recovery codes.
              </p>

              <form onSubmit={submit} className="auth__form">
                <label className="field">
                  <span>Authentication code</span>
                  <input
                    className="otp-input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={11}
                    placeholder="123 456"
                    spellCheck={false}
                    required
                  />
                </label>

                {error && <p className="form-error">{error}</p>}

                <button className="button button--primary button--block" type="submit" disabled={busy}>
                  {busy ? 'Checking…' : 'Verify and sign in'}
                </button>
                <button className="inline-link auth__restart" type="button" onClick={restart}>
                  Use a different account
                </button>
              </form>
            </>
          ) : (
            <>
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
                  ? 'Use your CocoaChess account. You do not need one to review games.'
                  : 'Only if you want one — the site works without an account.'}
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
            </>
          )}

          <p className="auth__legal">
            By continuing you agree to our{' '}
            <button className="inline-link" type="button" onClick={onPrivacy}>
              privacy policy
            </button>
            . We store your name, email and a password hash — plus an authenticator key only if you turn on two-factor.
          </p>

          <p className="auth__legal">
            Trouble signing in? <ReportIssue className="inline-link" label="Report an issue" />
          </p>
        </div>
      </section>
    </div>
  );
}
