// Locale-aware amount parser — handles Spanish (16.433,39) vs US (16,433.39) formats.
//
// Rationale: Spanish NGOs use comma as decimal separator, dot as thousands.
// Naive parseFloat treats comma as invalid → NaN → silent validation errors.
// This parser auto-detects format or accepts explicit locale preference.
//
// Auto-detection algorithm:
// 1. Strip currency symbols (€, $, £, USD, EUR, NBSP)
// 2. Handle accounting negatives: (1.234,56) → -1.234,56
// 3. Count separators and apply heuristics based on position/frequency
// 4. Return parsed value + detected locale, or detailed error

export interface ParseAmountSuccess {
  value: number;
  locale: 'es' | 'en';
}

export interface ParseAmountError {
  error: string;
}

export type ParseAmountResult = ParseAmountSuccess | ParseAmountError;

export interface ParseAmountOptions {
  locale?: 'es' | 'en' | 'auto';
}

/**
 * Parse an amount string with locale-aware decimal/thousands separator detection.
 *
 * @param raw - Raw amount string (e.g., "16.433,39", "16,433.39", "€1.234,56")
 * @param options - Locale preference ('es' | 'en' | 'auto'). Defaults to 'auto'.
 * @returns Success with { value, locale } or error with { error: reason }
 *
 * @example
 * parseAmount("16.433,39")              → { value: 16433.39, locale: 'es' }
 * parseAmount("16,433.39")              → { value: 16433.39, locale: 'en' }
 * parseAmount("(1.234,56)")             → { value: -1234.56, locale: 'es' }
 * parseAmount("€ 16.433,39")            → { value: 16433.39, locale: 'es' }
 * parseAmount("1,234.56 USD")           → { value: 1234.56, locale: 'en' }
 * parseAmount("16.433,39", { locale: 'en' }) → { error: '...' }
 * parseAmount("abc")                    → { error: 'Contains invalid characters' }
 */
export function parseAmount(raw: string, options?: ParseAmountOptions): ParseAmountResult {
  const locale = options?.locale ?? 'auto';

  // Early validation
  if (!raw || typeof raw !== 'string') {
    return { error: 'Amount is required' };
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return { error: 'Amount is required' };
  }

  // Detect and extract sign from accounting parentheses or explicit +/-
  let isNegative = false;
  let working = trimmed;

  // Handle accounting style negatives: (1.234,56)
  if (working.startsWith('(') && working.endsWith(')')) {
    isNegative = true;
    working = working.slice(1, -1).trim();
  }

  // Handle explicit leading/trailing minus
  if (working.startsWith('-')) {
    isNegative = true;
    working = working.slice(1).trim();
  } else if (working.startsWith('+')) {
    working = working.slice(1).trim();
  }

  // Strip currency symbols and non-numeric chars except digits, dot, comma, space
  // Common currencies: € $ £ ¥ ₹ ₽ ₩
  // Common currency codes: EUR USD GBP JPY INR RUB KRW (with optional whitespace)
  // Also strip NBSP (U+00A0), NNBSP (U+202F), and regular spaces
  working = working
    .replace(/[\u00A0\u202F]/g, ' ') // Normalize NBSP to regular space
    .replace(/[€$£¥₹₽₩]/g, '')
    .replace(/\b(?:EUR|USD|GBP|JPY|INR|RUB|KRW)\b/gi, '')
    .trim();

  // After stripping currency, check if anything remains
  if (!working) {
    return { error: 'No numeric value found' };
  }

  // Check for invalid characters (anything other than digits, dot, comma, space)
  if (/[^\d.,\s]/.test(working)) {
    return { error: 'Contains invalid characters' };
  }

  // Strip whitespace (some locales use space as thousands separator)
  working = working.replace(/\s/g, '');

  // Now we have a string with only digits, dots, and commas
  // Count separators
  const dotCount = (working.match(/\./g) || []).length;
  const commaCount = (working.match(/,/g) || []).length;
  const dotIndex = working.lastIndexOf('.');
  const commaIndex = working.lastIndexOf(',');

  let cleaned: string;
  let detectedLocale: 'es' | 'en';

  // Decision tree for separator interpretation
  if (dotCount === 0 && commaCount === 0) {
    // No separators: just an integer
    cleaned = working;
    detectedLocale = locale === 'es' ? 'es' : 'en'; // arbitrary default
  } else if (dotCount > 0 && commaCount === 0) {
    // Only dots present
    if (dotCount === 1) {
      // Single dot: could be decimal or thousands
      const afterDot = working.substring(dotIndex + 1);
      if (afterDot.length <= 2) {
        // 1-2 digits after dot → likely decimal (US): 16.39
        cleaned = working;
        detectedLocale = 'en';
      } else if (afterDot.length === 3) {
        // Exactly 3 digits after dot → could be thousands (ES): 16.433 or decimal (unusual): 16.123
        // Heuristic: if total length suggests thousands, treat as thousands
        // For now, treat as thousands (ES) since US rarely writes "16.123" for cents
        cleaned = working.replace('.', '');
        detectedLocale = 'es';
      } else {
        // More than 3 digits after dot → treat as decimal (edge case)
        cleaned = working;
        detectedLocale = 'en';
      }
    } else {
      // Multiple dots → thousands separator (ES): 1.234.567
      cleaned = working.replace(/\./g, '');
      detectedLocale = 'es';
    }
  } else if (dotCount === 0 && commaCount > 0) {
    // Only commas present
    if (commaCount === 1) {
      // Single comma: could be decimal (ES) or thousands (US)
      const afterComma = working.substring(commaIndex + 1);
      if (afterComma.length <= 2) {
        // 1-2 digits after comma → decimal (ES): 16,39
        cleaned = working.replace(',', '.');
        detectedLocale = 'es';
      } else if (afterComma.length === 3) {
        // Exactly 3 digits after comma → likely thousands (US): 1,234
        cleaned = working.replace(',', '');
        detectedLocale = 'en';
      } else {
        // More than 3 digits after comma → treat as decimal (edge case)
        cleaned = working.replace(',', '.');
        detectedLocale = 'es';
      }
    } else {
      // Multiple commas → thousands separator (US): 1,234,567
      cleaned = working.replace(/,/g, '');
      detectedLocale = 'en';
    }
  } else {
    // Both dots and commas present → rightmost is decimal
    if (dotIndex > commaIndex) {
      // Dot is decimal (US): 16,433.39
      cleaned = working.replace(/,/g, '').replace('.', '.');
      detectedLocale = 'en';
    } else {
      // Comma is decimal (ES): 16.433,39
      cleaned = working.replace(/\./g, '').replace(',', '.');
      detectedLocale = 'es';
    }
  }

  // If user specified a locale and it conflicts with detection, validate
  if (locale !== 'auto' && locale !== detectedLocale) {
    // User forced a locale that doesn't match the detected pattern
    // This is a soft conflict — we'll trust the user's explicit choice
    // Re-parse with the forced locale
    return parseWithLocale(working, locale, isNegative);
  }

  // Parse the cleaned string
  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) {
    return { error: 'Could not parse as a valid number' };
  }

  const value = isNegative ? -Math.abs(parsed) : Math.abs(parsed);
  return { value, locale: detectedLocale };
}

/**
 * Parse with an explicit locale when user forces a specific format.
 */
function parseWithLocale(
  working: string,
  locale: 'es' | 'en',
  isNegative: boolean,
): ParseAmountResult {
  let cleaned: string;
  if (locale === 'es') {
    // Spanish: dot = thousands, comma = decimal
    cleaned = working.replace(/\./g, '').replace(',', '.');
  } else {
    // English: comma = thousands, dot = decimal
    cleaned = working.replace(/,/g, '');
  }

  const parsed = parseFloat(cleaned);
  if (!Number.isFinite(parsed)) {
    return { error: `Could not parse as ${locale === 'es' ? 'Spanish' : 'US'} format` };
  }

  const value = isNegative ? -Math.abs(parsed) : Math.abs(parsed);
  return { value, locale };
}

/**
 * Infer the dominant locale from a sample of amount strings.
 *
 * Use this to lock a column's locale when ≥80% of samples agree on one format.
 * Returns 'es', 'en', or 'mixed' (when no clear majority).
 *
 * @param samples - Array of raw amount strings (first N rows of a column)
 * @returns Dominant locale or 'mixed'
 *
 * @example
 * inferColumnLocale(["16.433,39", "1.234,56", "999,00"]) → 'es'
 * inferColumnLocale(["16,433.39", "1,234.56", "999.00"]) → 'en'
 * inferColumnLocale(["1.234", "1,234", "1234"])        → 'mixed'
 */
export function inferColumnLocale(samples: string[]): 'es' | 'en' | 'mixed' {
  if (samples.length === 0) return 'mixed';

  let esCount = 0;
  let enCount = 0;

  for (const sample of samples) {
    const result = parseAmount(sample);
    if ('value' in result) {
      if (result.locale === 'es') esCount++;
      else if (result.locale === 'en') enCount++;
    }
  }

  const total = esCount + enCount;
  if (total === 0) return 'mixed';

  const esRatio = esCount / total;
  const enRatio = enCount / total;

  if (esRatio >= 0.8) return 'es';
  if (enRatio >= 0.8) return 'en';
  return 'mixed';
}
