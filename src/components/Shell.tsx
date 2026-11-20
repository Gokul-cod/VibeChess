import type { AuthUser } from '../types';
import { AppearanceMenu } from './AppearanceMenu';
import { ReportIssue } from './ReportIssue';
import { TwoFactorButton } from './TwoFactor';

export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <path
        d="M9.4 25.5h13.2l-1.1-3.1H10.5z"
        fill="#f0b264"
      />
      <path
        d="M12.3 22.4h7.4c.5-3.4 1.6-5.6 3.3-7.5 2.1-2.3 2.1-5.3.3-7.2-2.1-2.2-5.5-1.9-7.6.4-1 1.1-1.5 2.4-1.6 3.8l-2.9 3.6 2.5 1.2-2.1 5.7z"
        fill="#e9a44c"
      />
      <circle cx="19.6" cy="8.9" r="1.05" fill="#2a1609" />
      <path d="M6.8 26.9h18.4v2.2H6.8z" fill="#a9704a" />
    </svg>
  );
}

export function Brand({ tagline = 'weekly chess reviews' }: { tagline?: string }) {
  return (
    <div className="brand">
      <span className="brand__mark">
        <BrandMark />
      </span>
      <div>
        <p className="brand__name">CocoaChess</p>
        <p className="brand__tag">{tagline}</p>
      </div>
    </div>
  );
}

export type AppView = 'home' | 'weekly';

interface TopBarProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function TopBar({ view, onNavigate, user, onSignIn, onSignOut }: TopBarProps) {
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <header className="topbar">
      <Brand />
      <nav className="topnav" aria-label="Main">
        <button
          className={`topnav__tab${view === 'home' ? ' is-active' : ''}`}
          onClick={() => onNavigate('home')}
          aria-current={view === 'home' ? 'page' : undefined}
        >
          Game review
        </button>
        <button
          className={`topnav__tab${view === 'weekly' ? ' is-active' : ''}`}
          onClick={() => onNavigate('weekly')}
          aria-current={view === 'weekly' ? 'page' : undefined}
        >
          Weekly report
        </button>
      </nav>
      <div className="topbar__user">
        {user ? (
          <>
            <span className="avatar" aria-hidden="true">
              {initial}
            </span>
            <span className="topbar__email" title={user.email}>
              {user.email}
            </span>
            <AppearanceMenu />
            <button className="ghost-link" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <AppearanceMenu />
            <button className="button button--primary topbar__signin" onClick={onSignIn}>
              Sign in / Log in
            </button>
          </>
        )}
      </div>
    </header>
  );
}

export function SiteFooter({
  onPrivacy,
  engineMode,
  userEmail,
  user,
  onUserUpdated,
}: {
  onPrivacy: () => void;
  engineMode?: 'server' | 'browser' | null;
  userEmail?: string | null;
  user?: AuthUser | null;
  onUserUpdated?: (user: AuthUser) => void;
}) {
  return (
    <footer className="footer">
      <span>
        CocoaChess · Engine: Stockfish 19 ·{' '}
        {engineMode === 'browser' ? 'WebAssembly in your browser' : 'native analysis server'} ·{' '}
        <a
          className="footer__link"
          href={`${import.meta.env.BASE_URL}engine/COPYING.txt`}
          target="_blank"
          rel="noreferrer"
        >
          GPLv3
        </a>
      </span>
      <span className="footer__links">
        <button className="ghost-link" onClick={onPrivacy}>
          Privacy policy
        </button>
        {user && onUserUpdated && <TwoFactorButton user={user} onUpdated={onUserUpdated} />}
        <ReportIssue userEmail={userEmail} engineMode={engineMode} />
        <span>Games read from Chess.com &amp; Lichess public APIs</span>
      </span>
    </footer>
  );
}
