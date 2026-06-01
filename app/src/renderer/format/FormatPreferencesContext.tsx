// Issue #353 — Format preferences context (renderer).
//
// Holds the user's chosen date format and decimal/thousands separator and makes
// them available app-wide. The preferences are persisted in localStorage exactly
// like the Language setting. When the user has NOT explicitly chosen a value, we
// derive a sensible default from the active UI language WITHOUT persisting it —
// so switching language before the user expresses a preference re-derives cleanly
// (and avoids an i18n-resolution race on first paint).

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  dateFormatSchema,
  numberFormatSchema,
  defaultsFromLanguage,
  type DateFormat,
  type NumberFormat,
} from '../../shared/format/index.js';

/** localStorage keys — mirror the Language setting's renderer-only persistence. */
export const DATE_FORMAT_STORAGE_KEY = 'ot-date-format';
export const NUMBER_FORMAT_STORAGE_KEY = 'ot-number-format';

export interface FormatPreferencesValue {
  readonly dateFormat: DateFormat;
  readonly numberFormat: NumberFormat;
  /** BCP 47 locale for currency symbol/sign placement (language-driven). */
  readonly uiLocale: string;
  readonly setDateFormat: (df: DateFormat) => void;
  readonly setNumberFormat: (nf: NumberFormat) => void;
  /** True once the user has explicitly persisted a choice (vs. language default). */
  readonly dateFormatIsExplicit: boolean;
  readonly numberFormatIsExplicit: boolean;
}

const FormatPreferencesContext = createContext<FormatPreferencesValue | null>(null);

function readStoredDateFormat(): DateFormat | null {
  try {
    const raw = localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = dateFormatSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function readStoredNumberFormat(): NumberFormat | null {
  try {
    const raw = localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = numberFormatSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function uiLocaleFor(language: string): string {
  return language.toLowerCase().startsWith('es') ? 'es-ES' : 'en-US';
}

export function FormatPreferencesProvider({ children }: { children: ReactNode }): ReactElement {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';

  const [dateFormatPref, setDateFormatPref] = useState<DateFormat | null>(readStoredDateFormat);
  const [numberFormatPref, setNumberFormatPref] = useState<NumberFormat | null>(
    readStoredNumberFormat,
  );

  // Defaults are RE-derived from language on every render so that, while no
  // explicit preference exists, a language switch updates the format too.
  const defaults = defaultsFromLanguage(language);
  const dateFormat = dateFormatPref ?? defaults.dateFormat;
  const numberFormat = numberFormatPref ?? defaults.numberFormat;

  const setDateFormat = useCallback((df: DateFormat): void => {
    try {
      localStorage.setItem(DATE_FORMAT_STORAGE_KEY, df);
    } catch {
      /* localStorage unavailable — keep the in-memory value */
    }
    setDateFormatPref(df);
  }, []);

  const setNumberFormat = useCallback((nf: NumberFormat): void => {
    try {
      localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, nf);
    } catch {
      /* localStorage unavailable — keep the in-memory value */
    }
    setNumberFormatPref(nf);
  }, []);

  const value = useMemo<FormatPreferencesValue>(
    () => ({
      dateFormat,
      numberFormat,
      uiLocale: uiLocaleFor(language),
      setDateFormat,
      setNumberFormat,
      dateFormatIsExplicit: dateFormatPref !== null,
      numberFormatIsExplicit: numberFormatPref !== null,
    }),
    [
      dateFormat,
      numberFormat,
      language,
      setDateFormat,
      setNumberFormat,
      dateFormatPref,
      numberFormatPref,
    ],
  );

  return (
    <FormatPreferencesContext.Provider value={value}>{children}</FormatPreferencesContext.Provider>
  );
}

export function useFormatPrefs(): FormatPreferencesValue {
  const ctx = useContext(FormatPreferencesContext);
  const { i18n } = useTranslation();
  if (ctx !== null) return ctx;
  // No provider in the tree (e.g. an isolated component/screen test). Derive a
  // read-only, language-correct default so display formatting still works; the
  // setters are inert because there is nowhere to persist a change.
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const defaults = defaultsFromLanguage(language);
  return {
    dateFormat: defaults.dateFormat,
    numberFormat: defaults.numberFormat,
    uiLocale: uiLocaleFor(language),
    setDateFormat: () => {},
    setNumberFormat: () => {},
    dateFormatIsExplicit: false,
    numberFormatIsExplicit: false,
  };
}
