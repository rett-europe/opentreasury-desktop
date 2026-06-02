// Issue #353 — Renderer format-preferences public surface.

export {
  FormatPreferencesProvider,
  useFormatPrefs,
  DATE_FORMAT_STORAGE_KEY,
  NUMBER_FORMAT_STORAGE_KEY,
  type FormatPreferencesValue,
} from './FormatPreferencesContext.js';

export { useFormatters, type Formatters, type NumberFormatOpts } from './useFormatters.js';
