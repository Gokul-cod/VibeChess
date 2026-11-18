import { useEffect, useRef, useState } from 'react';

/** Every report from the site is addressed here. */
export const REPORT_INBOX = 'q8gokul@gmail.com';

interface ReportIssueProps {
  /** Prefilled as the reply-to line when someone is signed in. */
  userEmail?: string | null;
  engineMode?: 'server' | 'browser' | null;
  label?: string;
  className?: string;
}

/**
 * A "report an issue" button that opens a small dialog and hands the finished
 * message to the visitor's mail app. The site has no mail server of its own, so
 * the message leaves from the visitor's own address — which also means they
 * keep a copy of what they sent.
 */
export function ReportIssue({ userEmail, engineMode, label = 'Report an issue', className = 'ghost-link' }: ReportIssueProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [from, setFrom] = useState(userEmail ?? '');
  const [handedOff, setHandedOff] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setHandedOff(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const focus = window.setTimeout(() => areaRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(focus);
    };
  }, [open]);

  useEffect(() => {
    if (userEmail) setFrom(userEmail);
  }, [userEmail]);

  const engineLabel =
    engineMode === 'server'
      ? 'native analysis server'
      : engineMode === 'browser'
        ? 'Stockfish 19 in the browser'
        : 'not detected yet';

  const body = [
    message.trim(),
    '',
    '---',
    'Sent from VibeChess',
    `Reply to: ${from.trim() || 'not signed in'}`,
    `Engine: ${engineLabel}`,
    `Page: ${window.location.href}`,
    `Browser: ${navigator.userAgent}`,
    `When: ${new Date().toISOString()}`,
  ].join('\n');

  const href = `mailto:${REPORT_INBOX}?subject=${encodeURIComponent('VibeChess issue report')}&body=${encodeURIComponent(body)}`;
  const ready = message.trim().length >= 4;

  return (
    <>
      <button className={className} type="button" onClick={() => setOpen(true)}>
        {label}
      </button>

      {open && (
        <div
          className="report__overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="report__panel" role="dialog" aria-modal="true" aria-labelledby="report-title">
            <div className="report__head">
              <div>
                <h2 className="report__title" id="report-title">
                  Report an issue
                </h2>
                <p className="report__sub">
                  Tell us what went wrong — a wrong evaluation, a game that would not load, a weekly report that
                  reads oddly. Your message goes to {REPORT_INBOX}, and we include the page and browser so we can
                  reproduce it.
                </p>
              </div>
              <button className="report__close" type="button" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </button>
            </div>

            {handedOff ? (
              <>
                <p className="auth__notice">
                  Your mail app should be open with the report ready to send. Press send there and it will reach{' '}
                  {REPORT_INBOX}. If nothing opened, use the link below.
                </p>
                <p className="report__sub">
                  <a className="footer__link" href={href}>
                    Open the report in my mail app
                  </a>
                </p>
                <div className="report__actions">
                  <button className="button button--ghost button--small" type="button" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="field" htmlFor="report-message">
                  What happened?
                  <textarea
                    id="report-message"
                    ref={areaRef}
                    className="report__textarea"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="When I opened my weekly report the accuracy number was blank…"
                  />
                </label>

                <label className="field" htmlFor="report-from">
                  Your email (so we can reply)
                  <input
                    id="report-from"
                    type="email"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    placeholder="you@example.com"
                  />
                </label>

                <div className="report__actions">
                  <button className="button button--ghost button--small" type="button" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <a
                    className={`button button--primary button--small${ready ? '' : ' is-disabled'}`}
                    href={ready ? href : undefined}
                    aria-disabled={ready ? undefined : true}
                    onClick={(event) => {
                      if (!ready) {
                        event.preventDefault();
                        return;
                      }
                      setHandedOff(true);
                    }}
                  >
                    Send report
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
