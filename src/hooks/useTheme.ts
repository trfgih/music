import { useCallback, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const THEME_KEY = 'melodia:theme';

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function initialTheme(): { theme: Theme; explicit: boolean } {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return { theme: saved, explicit: true };
  } catch {
    // Недоступное хранилище не мешает выбору темы в текущем сеансе.
  }
  return { theme: systemTheme(), explicit: false };
}

export function useTheme() {
  const [state, setState] = useState(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.documentElement.style.colorScheme = state.theme;
  }, [state.theme]);

  useEffect(() => {
    if (state.explicit || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changeTheme = (event: MediaQueryListEvent) => {
      setState({ theme: event.matches ? 'dark' : 'light', explicit: false });
    };
    media.addEventListener('change', changeTheme);
    return () => media.removeEventListener('change', changeTheme);
  }, [state.explicit]);

  const toggleTheme = useCallback(() => {
    setState((previous) => {
      const theme = previous.theme === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_KEY, theme);
      } catch {
        // Сохраняем явный выбор в памяти, даже если браузер запретил localStorage.
      }
      return { theme, explicit: true };
    });
  }, []);

  return { theme: state.theme, toggleTheme };
}
