export type ThemeMode = 'light' | 'dark';

const getSystemTheme = (): ThemeMode => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'dark';
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
};

export const normalizeThemeMode = (value: unknown, fallback: ThemeMode = 'dark'): ThemeMode => {
  if (value === 'light' || value === 'dark') return value;
  if (value === 'system') return getSystemTheme();
  if (value === 'dim') return 'dark';
  return fallback;
};