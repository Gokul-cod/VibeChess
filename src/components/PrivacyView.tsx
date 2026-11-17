import { Brand, BrandMark } from './Shell';

const UPDATED = '17 November 2026';
const CONTACT = 'privacy@vibechess.app';

export function PrivacyView({ onBack }: { onBack: () => void }) {
  return (
    <div className="policy-page">
      <header className="policy-head">
        <Brand tagline="weekly chess reviews" />
        <button className="button button--ghost" onClick={onBack}>
          <span aria-hidden="true">←</span> Back to VibeChess
        </button>
      </header>

      <main className="policy">
        <p className="eyebrow">Legal</p>
        <h1>Privacy policy</h1>
        <p className="policy__updated">Last updated: {UPDATED}</p>

        <p className="policy__lede">
          VibeChess reviews chess games and builds weekly reports. This page explains exactly what we store, why,
          and what you can ask us to do about it. It describes the app as it is built, not a generic template.
        </p>

        <section>
          <h2>1. Who we are</h2>
          <p>
            VibeChess (“we”, “us”) is a chess review web application. For the purposes of the EU/UK General Data
            Protection Regulation we are the data controller for the account information described below. You can
            reach us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </section>

        <section>
          <h2>2. What we collect</h2>
          <ul>
            <li>
              <strong>Account details.</strong> When you create an account we store your display name, your email
              address, a randomly generated salt, a PBKDF2-SHA256 hash of your password (100,000 iterations), and
              the date the account was created. We never store the password itself and cannot recover it.
            </li>
            <li>
              <strong>Session cookie.</strong> A single cookie named <code>vc_session</code> holds a random session
              token so you stay signed in. The token is stored only as a SHA-256 hash in our database and expires
              after 30 days or when you sign out.
            </li>
            <li>
              <strong>Chess usernames you look up.</strong> When you request a player's games or a weekly report we
              send the username you typed to Chess.com or Lichess. We keep short-lived in-memory caches (a couple
              of minutes) of public game lists so repeated requests are fast, and we do not keep a history of who
              searched for whom.
            </li>
            <li>
              <strong>Technical data.</strong> Our hosting provider processes standard request data (IP address,
              user agent, timestamp) to deliver the site, keep it secure and apply rate limits to sign-in attempts.
              We do not run advertising or third-party analytics trackers.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> collect payment details, phone numbers, address books, contacts or precise
            location, and we do not sell personal data.
          </p>
        </section>

        <section>
          <h2>3. Game analysis stays on your device</h2>
          <p>
            Stockfish 19 runs in your browser as WebAssembly. The games you review — including PGN files you paste
            or drop in — are analysed locally. The PGN text of a game you open is not sent to us for analysis and we
            do not store a copy of your games. The only exception is the public game data we fetch on your behalf
            when you ask for a player's games, which passes through our server to reach your browser.
          </p>
        </section>

        <section>
          <h2>4. Why we use it, and our legal bases</h2>
          <ul>
            <li>
              <strong>To provide the service</strong> — creating your account, signing you in, fetching the games
              you request. Legal basis: performance of our contract with you (GDPR Art. 6(1)(b)).
            </li>
            <li>
              <strong>To keep the service secure</strong> — rate limiting, abuse prevention, debugging. Legal
              basis: our legitimate interests in a safe, working service (Art. 6(1)(f)).
            </li>
            <li>
              <strong>To comply with the law</strong> — responding to valid legal requests. Legal basis: legal
              obligation (Art. 6(1)(c)).
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Cookies and local storage</h2>
          <p>
            We set one essential first-party cookie, <code>vc_session</code>, strictly to keep you signed in. It is
            <code> HttpOnly</code>, <code>SameSite=Lax</code> and <code>Secure</code> on the hosted site, and lasts
            30 days. It is not used for advertising or cross-site tracking, so no consent banner is required for it.
            Your browser may also keep small preferences (for example your last review depth) in local storage; that
            data stays in your browser and is not transmitted to us.
          </p>
        </section>

        <section>
          <h2>6. Who we share data with</h2>
          <ul>
            <li>
              <strong>Cloudflare</strong> — hosting and database infrastructure (Workers, D1). Requests necessarily
              pass through their network.
            </li>
            <li>
              <strong>Chess.com and Lichess</strong> — we query their public APIs for games you ask about. Your
              request to them contains the username you typed, not your email or account identity.
            </li>
          </ul>
          <p>
            We do not sell or rent personal data, and we do not share it with advertisers or data brokers. We may
            disclose information if legally required to, or to protect the rights and safety of users.
          </p>
        </section>

        <section>
          <h2>7. How long we keep it</h2>
          <ul>
            <li>Account details: until you delete your account or ask us to delete it.</li>
            <li>Session records: 30 days from sign-in, or immediately when you sign out.</li>
            <li>Rate-limit counters: a few minutes, in memory only.</li>
            <li>Public game caches: about two minutes, in memory only.</li>
          </ul>
        </section>

        <section>
          <h2>8. Security</h2>
          <p>
            All traffic is served over HTTPS. Passwords are salted and hashed with PBKDF2-SHA256 before storage;
            session tokens are random 256-bit values stored only as hashes and sent in an <code>HttpOnly</code>{' '}
            cookie, which JavaScript cannot read. Sign-in and sign-up are rate limited. No system is perfectly
            secure, but if we ever become aware of a breach affecting your data we will notify affected users and
            the relevant authority as required by law.
          </p>
        </section>

        <section>
          <h2>9. Your rights</h2>
          <p>
            Depending on where you live you may have the right to access a copy of your data, correct it, delete it,
            restrict or object to processing, receive it in a portable format, or withdraw consent. To exercise any
            of these, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> from the address on your account. We respond
            within 30 days. You can also complain to your local data protection authority.
          </p>
          <p>
            <strong>Deleting your account.</strong> Ask us at the address above and we will remove your account and
            all associated sessions. Reviews and reports are computed in your browser and are not stored on our
            servers, so there is nothing else to erase.
          </p>
        </section>

        <section>
          <h2>10. International transfers</h2>
          <p>
            Our infrastructure provider may process data in countries other than yours, including the United
            States. Where that happens, transfers rely on the provider's standard contractual clauses and
            equivalent safeguards.
          </p>
        </section>

        <section>
          <h2>11. Children</h2>
          <p>
            VibeChess is not directed at children under 13 (or under 16 in the European Economic Area and the UK).
            We do not knowingly collect personal data from them. If you believe a child created an account, contact
            us and we will delete it.
          </p>
        </section>

        <section>
          <h2>12. Changes to this policy</h2>
          <p>
            If we change how the service handles data we will update this page and change the date at the top. If a
            change materially affects your rights we will announce it in the app before it takes effect.
          </p>
        </section>

        <section>
          <h2>13. Contact</h2>
          <p>
            Questions, requests or complaints: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
          </p>
        </section>

        <div className="policy__foot">
          <BrandMark size={20} />
          <span>VibeChess · chess review without the noise</span>
        </div>
      </main>
    </div>
  );
}
