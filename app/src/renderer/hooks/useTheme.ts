// Theme hook — light / dark / system.
//
// Responsibility:
//   1. Read user preference from localStorage (`opentreasury.theme`).
//   2. Default to 'system' if unset; apply OS `prefers-color-scheme` via CSS
//      (see tokens.css — `[data-theme="system"]` + media query).
//   3. Apply `data-theme` attribute to <html> whenever the value changes.
//   4. Persist manual overrides.
//
// NOTE on persistence: tokens.md §9 + ADR-003 §7.3 both say the *final* home
// for the preference is the `%APPDATA%` user-prefs file via the main process
// (never OneDrive — per-device). localStorage is the v0.1 stand-in until the
// preload/main bridge lands. Swap this file's `loadInitial` / `persist` when
// the bridge exists; React surface stays the same.

import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'opentreasury.theme';

function readStored(): ThemeChoice {
  // SSR / non-browser test shim.
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'system';
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') {
    return raw;
  }
  return 'system';
}

function applyToDocument(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', choice);
}

export interface UseThemeResult {
  readonly theme: ThemeChoice;
  readonly setTheme: (next: ThemeChoice) => void;
  readonly toggle: () => void;
}

export function useTheme(): UseThemeResult {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStored());

  // Apply on mount + on change.
  useEffect(() => {
    applyToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next);
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      // system → light → dark → system (explicit cycle; predictable for keyboard users).
      const next: ThemeChoice = prev === 'system' ? 'light' : prev === 'light' ? 'dark' : 'system';
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  return { theme, setTheme, toggle };
}
