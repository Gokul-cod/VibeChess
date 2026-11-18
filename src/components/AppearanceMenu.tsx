import { useEffect, useRef, useState } from 'react';
import { applyTheme, readTheme, THEMES, type Theme } from '../lib/theme';

function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <path
        d="M15.4 3.6a2.1 2.1 0 0 1 3 0l2 2a2.1 2.1 0 0 1 0 3l-6.7 6.7-3.3.6.6-3.3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M8.9 15.1c-1.6-.2-2.9 1.1-2.9 2.7 0 1-.5 1.9-1.4 2.4 2 .6 4.2.6 5.3-.5.9-.9 1.2-2.2.7-3.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppearanceMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const choose = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
    setOpen(false);
  };

  return (
    <div className="appearance" ref={wrap}>
      <button
        type="button"
        className="appearance__button"
        aria-label="Appearance"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Appearance"
        onClick={() => setOpen((value) => !value)}
      >
        <BrushIcon />
      </button>

      {open && (
        <div className="appearance__menu" role="menu" aria-label="Appearance">
          {THEMES.map((option) => {
            const active = theme === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`appearance__option${active ? ' is-active' : ''}`}
                onClick={() => choose(option.id)}
              >
                <span className={`appearance__swatch appearance__swatch--${option.id}`} aria-hidden="true" />
                <span>{option.label}</span>
                {active && (
                  <span className="appearance__check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
