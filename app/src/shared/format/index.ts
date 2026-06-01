// Issue #353 — Public API for the shared formatting layer.
//
// Import from `shared/format` (this barrel) rather than the individual files so
// the internal layout can evolve without touching consumers.

export {
  DATE_FORMATS,
  NUMBER_FORMATS,
  dateFormatSchema,
  numberFormatSchema,
  formatPreferencesSchema,
  defaultsFromLanguage,
  type DateFormat,
  type NumberFormat,
  type FormatPreferences,
} from './types.js';

export {
  formatDateNumeric,
  formatDateRangeNumeric,
  parseDateNumeric,
  placeholderFor,
  dateSeparatorFor,
} from './dates.js';

export {
  decimalSeparatorFor,
  thousandsSeparatorFor,
  formatNumber,
  parseAmount,
  isValidAmountInput,
  formatAmountForInput,
  type FormatNumberOptions,
} from './numbers.js';

export { formatExportDate, formatExportAmount } from './export.js';
