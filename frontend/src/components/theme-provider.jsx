import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(undefined);
const STORAGE_KEY = 'intellidoc-theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children, defaultTheme = 'system' }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const resolved = theme === 'system' ? getSystemTheme() : theme;

    root.classList.remove('light', 'dark');
    root.classList.add(resolved);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore write failures (e.g. private browsing)
    }
  }, [theme]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(getSystemTheme());
    };
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
