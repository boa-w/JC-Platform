import { useEffect, useState } from 'react';
import { getStorageItem, setStorageItem } from '../utils/safeStorage';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'jc-platform.theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = getStorageItem(STORAGE_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    setStorageItem(STORAGE_KEY, theme);
  }, [theme]);

  function toggleTheme() {
    setThemeState((current) => (current === 'light' ? 'dark' : 'light'));
  }

  return { theme, toggleTheme } as const;
}
