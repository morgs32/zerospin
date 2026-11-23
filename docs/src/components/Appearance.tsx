'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

type ITheme = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{
  theme: ITheme;
  chooseTheme: (theme: ITheme) => void;
} | null>(null);

export function Appearance({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ITheme>('system');

  useEffect(() => {
    const saved = localStorage.getItem('fragment-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  function chooseTheme(next: ITheme) {
    setTheme(next);
    localStorage.setItem('fragment-theme', next);
  }

  return (
    <ThemeContext.Provider value={{ theme, chooseTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeSwitch() {
  const appearance = useContext(ThemeContext);
  if (!appearance) throw new Error('ThemeSwitch requires Appearance.');

  return (
    <div className="theme-switch" aria-label="Color theme">
      {(['light', 'dark', 'system'] as const).map(option => (
        <button
          key={option}
          type="button"
          onClick={() => appearance.chooseTheme(option)}
          aria-pressed={appearance.theme === option}
        >
          <span aria-hidden="true">
            {appearance.theme === option ? '●' : '○'}
          </span>{' '}
          {option[0].toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}
