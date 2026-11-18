export type Theme = 'default' | 'dark' | 'light' | 'glass';

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'default', label: 'Default' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'glass', label: 'Glass' },
];

const STORAGE_KEY = 'cocoachess.theme';

const THEME_COLOR: Record<Theme, string> = {
  default: '#1b100a',
  dark: '#0a0b0d',
  light: '#f7f3ec',
  glass: '#0b1a25',
};

function isTheme(value: string | null): value is Theme {
  return value === 'default' || value === 'dark' || value === 'light' || value === 'glass';
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isTheme(stored) ? stored : 'default';
  } catch {
    return 'default';
  }
}

function paint(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'default') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = theme;
  }
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

/** Applies the saved appearance without touching storage (safe before first paint). */
export function initTheme(): Theme {
  const theme = readTheme();
  paint(theme);
  return theme;
}

export function applyTheme(theme: Theme) {
  paint(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* Private browsing can refuse storage; the theme still applies for this visit. */
  }
}
