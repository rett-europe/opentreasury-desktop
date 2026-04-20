// Cell sanitization utility — normalizes ExcelJS cell shapes to plain strings.
//
// ExcelJS returns various cell value shapes:
// - Primitives: string | number | boolean | Date
// - Objects: { formula, result }, { richText: [...] }, { text: ... }, { error: ... }
//
// This function normalizes all shapes to plain strings for the parser layer.
// Used by both stage-file (preview) and dry-run/commit (validation + import) paths.

/**
 * Sanitize an ExcelJS cell value to a plain string.
 *
 * Handles all ExcelJS value shapes:
 * - null/undefined → ''
 * - Date → ISO date string (YYYY-MM-DD)
 * - { richText: [...] } → concatenated text
 * - { text: ... } → text value
 * - { formula, result } → sanitized result (recursive)
 * - { formula } (no result) → formula string
 * - { error } → error value as string
 * - primitives → String(value)
 *
 * Optionally strips control characters and caps length for UI preview.
 *
 * @param value - Raw ExcelJS cell value (unknown type)
 * @param options - Sanitization options
 * @param options.stripControlChars - Remove ASCII control chars (0x00-0x1F, 0x7F)
 * @param options.maxLength - Cap string length
 * @returns Plain string representation
 *
 * @example
 * sanitizeCell(null)                                      → ''
 * sanitizeCell(42)                                        → '42'
 * sanitizeCell(new Date('2025-01-01'))                    → '2025-01-01'
 * sanitizeCell({ formula: 'A1+B1', result: 123.45 })      → '123.45'
 * sanitizeCell({ richText: [{ text: 'Hello' }] })         → 'Hello'
 * sanitizeCell('test\x00', { stripControlChars: true })   → 'test'
 * sanitizeCell('very long...', { maxLength: 10 })         → 'very long...'
 */
export function sanitizeCell(
  value: unknown,
  options?: { stripControlChars?: boolean; maxLength?: number },
): string {
  if (value === null || value === undefined) return '';

  let s: string;

  if (value instanceof Date) {
    s = value.toISOString().substring(0, 10);
  } else if (typeof value === 'object' && value !== null) {
    const v = value as Record<string, unknown>;

    // { richText: [{ text: 'foo' }, { text: 'bar' }] }
    if ('richText' in v && Array.isArray(v.richText)) {
      s = (v.richText as Array<{ text?: unknown }>)
        .map((r) => sanitizeCell(r?.text ?? '', options))
        .join('');
    }
    // { text: 'some text' }
    else if ('text' in v && v.text !== null && v.text !== undefined) {
      s = String(v.text);
    }
    // { formula: 'A1+B1', result: 16433.39 }
    else if ('result' in v && v.result !== null && v.result !== undefined) {
      s = sanitizeCell(v.result, options);
    }
    // { formula: 'A1+B1' } (no result yet, or error)
    else if ('formula' in v) {
      s = String(v.formula ?? '');
    }
    // { error: '#DIV/0!' }
    else if ('error' in v) {
      s = String(v.error);
    }
    // Unknown object shape → empty (fail safe, don't stringify to "[object Object]")
    else {
      s = '';
    }
  } else {
    s = String(value);
  }

  s = s.trim();

  // Apply optional post-processing
  if (options?.stripControlChars) {
    // eslint-disable-next-line no-control-regex
    s = s.replace(/[\x00-\x1F\x7F]/g, '');
  }

  if (options?.maxLength !== undefined) {
    s = s.substring(0, options.maxLength);
  }

  return s;
}
