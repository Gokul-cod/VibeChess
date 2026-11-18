import { useEffect, useState, type FormEvent } from 'react';
import { disableTwoFactor, enableTwoFactor, startTwoFactorSetup, type TwoFactorSetup } from '../lib/auth';
import type { AuthUser } from '../types';

type Step = 'off' | 'setup' | 'codes' | 'on';

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none">
      <path
        d="M12 3.2 5.4 5.8v5.4c0 4 2.8 7.4 6.6 9 3.8-1.6 6.6-5 6.6-9V5.8z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m9.2 11.6 2 2 3.6-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TwoFactorButton({
  user,
  onUpdated,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="ghost-link twofa__trigger" type="button" onClick={() => setOpen(true)}>
        <ShieldIcon />
        <span>{user.twoFactor ? 'Two-factor: on' : 'Two-factor'}</span>
      </button>
      {open && <TwoFactorDialog user={user} onUpdated={onUpdated} onClose={() => setOpen(false)} />}
    </>
  );
}

function TwoFactorDialog({
  user,
  onUpdated,
  onClose,
}: {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(user.twoFactor ? 'on' : 'off');
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const beginSetup = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await startTwoFactorSetup());
      setCode('');
      setStep('setup');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finishSetup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setRecoveryCodes(await enableTwoFactor(code.trim()));
      setStep('codes');
      onUpdated({ ...user, twoFactor: true });
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await disableTwoFactor(password);
      onUpdated({ ...user, twoFactor: false });
      setPassword('');
      setSetup(null);
      setRecoveryCodes([]);
      setStep('off');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report__overlay" role="presentation" onClick={onClose}>
      <div
        className="report__panel twofa__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="twofa-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="report__head">
          <div>
            <h2 className="report__title" id="twofa-title">
              Two-factor authentication
            </h2>
            <p className="report__sub">
              {step === 'on'
                ? 'On. Signing in asks for a code from your authenticator app after your password.'
                : step === 'codes'
                  ? 'On. Keep the recovery codes below somewhere safe.'
                  : 'Add a one-time code from an authenticator app to every sign-in.'}
            </p>
          </div>
          <button className="report__close" type="button" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {step === 'off' && (
          <>
            <p className="twofa__text">
              You will need an authenticator app — Google Authenticator, Authy, 1Password, Microsoft Authenticator or
              any app that supports 6-digit codes. No phone number or email code involved.
            </p>
            {error && <p className="form-error">{error}</p>}
            <div className="report__actions">
              <button className="button button--primary" type="button" onClick={() => void beginSetup()} disabled={busy}>
                {busy ? 'Preparing…' : 'Turn on two-factor'}
              </button>
            </div>
          </>
        )}

        {step === 'setup' && setup && (
          <form className="twofa__form" onSubmit={finishSetup}>
            <ol className="twofa__steps">
              <li>Open your authenticator app and choose “Add account” → “Enter a setup key”.</li>
              <li>Name it CocoaChess and paste the key below.</li>
              <li>Type the 6-digit code the app shows to switch it on.</li>
            </ol>

            <div className="twofa__secret" aria-label="Setup key">
              <code>{setup.secret}</code>
            </div>
            <a className="twofa__uri" href={setup.uri}>
              Open this key in an authenticator app
            </a>

            <label className="field">
              <span>6-digit code from the app</span>
              <input
                className="otp-input"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="123 456"
                spellCheck={false}
                required
              />
            </label>

            {error && <p className="form-error">{error}</p>}

            <div className="report__actions">
              <button className="button button--primary" type="submit" disabled={busy}>
                {busy ? 'Checking…' : 'Turn on two-factor'}
              </button>
              <button className="button button--ghost" type="button" onClick={() => setStep('off')} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {step === 'codes' && (
          <>
            <p className="twofa__text">
              Two-factor is on. Save these recovery codes somewhere safe — each one signs you in once if you lose your
              phone. They will not be shown again.
            </p>
            <div className="twofa__codes">
              {recoveryCodes.map((entry) => (
                <code key={entry}>{entry}</code>
              ))}
            </div>
            <div className="report__actions">
              <button
                className="button button--primary"
                type="button"
                onClick={() => {
                  setStep('on');
                  setRecoveryCodes([]);
                }}
              >
                I have saved them
              </button>
            </div>
          </>
        )}

        {step === 'on' && (
          <form className="twofa__form" onSubmit={turnOff}>
            <p className="twofa__text">
              Signing in on a new device asks for your password and then a code from your authenticator app. Recovery
              codes work if the app is unavailable.
            </p>
            <label className="field">
              <span>Password, to turn it off</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Your password"
                required
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="report__actions">
              <button className="button button--ghost" type="submit" disabled={busy}>
                {busy ? 'Turning off…' : 'Turn off two-factor'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
