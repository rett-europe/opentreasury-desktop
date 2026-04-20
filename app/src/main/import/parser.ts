// Parser utilities for import — date and amount parsing with validation.

import {
  parseAmount as parseAmountLocaleAware,
  type ParseAmountResult as LocaleParseResult,
} from './amountParser.js';

export interface ParseDateResult {
  success: boolean;
  date?: string; // ISO 8601 YYYY-MM-DD
  error?: string;
}

export interface ParseAmountResult {
  success: boolean;
  amount?: number;
  type?: 'income' | 'expense';
  error?: string;
}

/**
 * Parse a date string with format auto-detection.
 *
 * Supports:
 * - ISO: YYYY-MM-DD, YYYY/MM/DD
 * - European: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
 * - US: MM/DD/YYYY, MM-DD-YYYY
 * - Excel serial dates (numbers)
 *
 * @param value - Raw cell value (string or number)
 * @param preferredFormat - Preferred interpretation when ambiguous
 * @returns Parse result with ISO date or error
 */
export function parseDate(
  value: unknown,
  preferredFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' = 'DD/MM/YYYY',
): ParseDateResult {
  if (value === null || value === undefined || value === '') {
    return { success: false, error: 'Date is required' };
  }

  // Excel serial date (number): days since 1900-01-01
  if (typeof value === 'number') {
    try {
      const msPerDay = 86400000;
      const excelEpoch = new Date(1900, 0, 1).getTime();
      const adjustedSerial = value - 2; // Excel has a leap year bug for 1900
      const date = new Date(excelEpoch + adjustedSerial * msPerDay);
      if (isNaN(date.getTime())) {
        return { success: false, error: 'Invalid Excel date serial' };
      }
      return { success: true, date: formatIsoDate(date) };
    } catch {
      return { success: false, error: 'Invalid Excel date serial' };
    }
  }

  const str = String(value).trim();
  if (!str) {
    return { success: false, error: 'Date is required' };
  }

  // Try ISO format first (YYYY-MM-DD or YYYY/MM/DD)
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (isValidDate(date)) {
      return { success: true, date: formatIsoDate(date) };
    }
    return { success: false, error: 'Date out of range' };
  }

  // Try DD/MM/YYYY or MM/DD/YYYY with various separators
  const parts = str.split(/[-/.]/);
  if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
    const [firstStr, secondStr, thirdStr] = parts;
    const first = Number(firstStr);
    const second = Number(secondStr);
    const third = Number(thirdStr);
    let year: number, month: number, day: number;

    // Determine if third part is year (2 or 4 digits)
    if (third >= 1900 && third <= 2100) {
      year = third;
    } else if (third >= 0 && third <= 99) {
      // 2-digit year: assume 20xx if < 50, 19xx otherwise
      year = third < 50 ? 2000 + third : 1900 + third;
    } else {
      return { success: false, error: 'Invalid date format' };
    }

    if (preferredFormat === 'MM/DD/YYYY') {
      month = first;
      day = second;
    } else {
      day = first;
      month = second;
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { success: false, error: 'Date out of range' };
    }

    const date = new Date(year, month - 1, day);
    if (isValidDate(date) && date.getDate() === day) {
      return { success: true, date: formatIsoDate(date) };
    }
    return { success: false, error: 'Date out of range' };
  }

  return { success: false, error: 'Invalid date format' };
}

/**
 * Parse an amount string with locale-aware formatting (Spanish vs US).
 *
 * Delegates to the new locale-aware parser (amountParser.ts) which handles:
 * - Spanish format: 16.433,39 (dot=thousands, comma=decimal)
 * - US/UK format: 16,433.39 (comma=thousands, dot=decimal)
 * - Auto-detection based on separator patterns
 * - Currency symbols (€, $, £, USD, EUR, etc.)
 * - Accounting negatives: (1.234,56)
 * - Leading/trailing signs: -1.234,56
 * - CR/DB suffixes (legacy, still supported)
 *
 * @param value - Raw cell value
 * @returns Parse result with amount, type, or detailed error reason
 */
export function parseAmount(value: unknown): ParseAmountResult {
  if (value === null || value === undefined || value === '') {
    return { success: false, error: 'Amount is required and must be non-zero' };
  }

  // Handle numeric values directly (Excel might provide numbers)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value === 0) {
      return { success: false, error: 'Amount is required and must be non-zero' };
    }
    const type = value < 0 ? 'expense' : 'income';
    return { success: true, amount: Math.abs(value), type };
  }

  // Convert to string and handle CR/DB suffixes (legacy bank export format)
  let str = String(value).trim();
  if (!str) {
    return { success: false, error: 'Amount is required and must be non-zero' };
  }

  let isCredit = false;
  let isDebit = false;
  if (/\bCR\b/i.test(str)) {
    isCredit = true;
    str = str.replace(/\bCR\b/i, '').trim();
  } else if (/\bDB\b/i.test(str)) {
    isDebit = true;
    str = str.replace(/\bDB\b/i, '').trim();
  }

  // Delegate to locale-aware parser
  const localeResult: LocaleParseResult = parseAmountLocaleAware(str);

  if ('error' in localeResult) {
    return { success: false, error: localeResult.error };
  }

  // Apply CR/DB sign overrides if present (CR=credit=positive, DB=debit=negative)
  let finalValue = localeResult.value;
  if (isDebit && finalValue > 0) {
    finalValue = -finalValue;
  } else if (isCredit && finalValue < 0) {
    finalValue = -finalValue; // flip to positive
  }

  // Determine income vs expense
  const type = finalValue < 0 ? 'expense' : 'income';

  return { success: true, amount: Math.abs(finalValue), type };
}

function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
