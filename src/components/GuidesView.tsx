import { GUIDE_COUNT, GUIDE_GROUPS } from '../lib/guides';

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none">
      <path d="M7 17 17 7M9 7h8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function GuidesView() {
  return (
    <section className="guides">
      <div className="guides__intro">
        <p className="eyebrow">Guides · {GUIDE_COUNT} lessons</p>
        <h1>
          Everything Lichess teaches, <em>in one list.</em>
        </h1>
        <p className="guides__lede">
          Lichess's Learn section is the best free chess course online: eighteen basics chapters, thirty-one practice
          lessons and a handful of daily trainers. This page indexes all of it so you can find the lesson you need
          without hunting through their menu.
        </p>
        <p className="guides__note">
          The lessons are interactive boards that run on Lichess itself, so each one opens there in a new tab.
        </p>
      </div>

      {GUIDE_GROUPS.map((group) => (
        <div className="panel guides__group" key={group.id}>
          <header className="guides__head">
            <div>
              <p className="eyebrow">{group.kicker}</p>
              <h2>{group.title}</h2>
            </div>
            <span className="guides__count">{group.lessons.length} lessons</span>
          </header>
          <p className="guides__blurb">{group.intro}</p>

          <div className="guides__grid">
            {group.lessons.map((lesson, index) => (
              <a
                className="guide"
                key={`${group.id}-${lesson.title}`}
                href={lesson.href}
                target="_blank"
                rel="noreferrer"
              >
                <span className="guide__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="guide__text">
                  <span className="guide__title">{lesson.title}</span>
                  <span className="guide__blurb">{lesson.blurb}</span>
                </span>
                <span className="guide__arrow" aria-hidden="true">
                  <Arrow />
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}

      <p className="guides__credit">
        Lessons, wording and exercises belong to{' '}
        <a href="https://lichess.org" target="_blank" rel="noreferrer">
          Lichess
        </a>
        , a free and open-source chess server. CocoaChess only indexes them.
      </p>
    </section>
  );
}
