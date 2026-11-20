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

export type AppView = 'home' | 'weekly' | 'guides';

interface TopBarProps {
  view: AppView;
  onNavigate: (view: AppView) => void;
  user: AuthUser | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

function DiscordLink() {
  return (
    <a
      className="topbar__discord"
      href="https://discord.gg/VbXc58aDTs"
      target="_blank"
      rel="noreferrer"
      aria-label="Join the CocoaChess Discord server"
      title="Join our Discord"
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276 12.2986 12.2986 0 0 1-1.873.8914.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286ZM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189Zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
        />
      </svg>
    </a>
  );
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
        <button
          className={`topnav__tab${view === 'guides' ? ' is-active' : ''}`}
          onClick={() => onNavigate('guides')}
          aria-current={view === 'guides' ? 'page' : undefined}
        >
          Guides
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
            <DiscordLink />
            <button className="ghost-link" onClick={onSignOut}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <AppearanceMenu />
            <DiscordLink />
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
