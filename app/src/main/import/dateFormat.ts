// Date format auto-detection for import — WI-17.
//
// Implements the algorithm from copilot-directive-wi17-date-format.md:
// - Scan ≥10 date cells from the mapped column
// - If any month value >12 in DD/MM position → infer DD/MM/YYYY
// - If any month value >12 in MM/DD position → infer MM/DD/YYYY
// - If ambiguous (all components ≤12), default to DD/MM (Spanish convention)
// - ISO YYYY-MM-DD detected unambiguously by regex

export interface DateFormatDetectionResult {
  format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  ambiguous: boolean;
}

/**
 * Auto-detect date format from a sample of date strings.
 *
 * @param dateSamples - Array of date strings from the import file (≥10 recommended)
 * @returns Detected format and whether it was ambiguous
 */
export function detectDateFormat(dateSamples: string[]): DateFormatDetectionResult {
  if (dateSamples.length === 0) {
    return { format: 'DD/MM/YYYY', ambiguous: true };
  }

  // ISO format: YYYY-MM-DD (4-digit year first)
  const isoPattern = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
  const hasIso = dateSamples.some((s) => isoPattern.test(s));
  if (hasIso) {
    return { format: 'YYYY-MM-DD', ambiguous: false };
  }

  // Try to infer DD/MM vs MM/DD by looking for values >12
  let hasDayGreaterThan12InFirstPosition = false;
  let hasDayGreaterThan12InSecondPosition = false;

  for (const sample of dateSamples) {
    const trimmed = sample.trim();
    if (!trimmed) continue;

    // Match patterns like DD/MM/YYYY or MM/DD/YYYY with various separators
    const parts = trimmed.split(/[-/.]/);
    if (parts.length !== 3 || !parts[0] || !parts[1]) continue;

    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);

    // If first component >12, it must be a day → DD/MM/YYYY
    if (first > 12) {
      hasDayGreaterThan12InFirstPosition = true;
    }

    // If second component >12, it must be a day → MM/DD/YYYY
    if (second > 12) {
      hasDayGreaterThan12InSecondPosition = true;
    }
  }

  if (hasDayGreaterThan12InFirstPosition && !hasDayGreaterThan12InSecondPosition) {
    return { format: 'DD/MM/YYYY', ambiguous: false };
  }

  if (hasDayGreaterThan12InSecondPosition && !hasDayGreaterThan12InFirstPosition) {
    return { format: 'MM/DD/YYYY', ambiguous: false };
  }

  // Ambiguous: default to DD/MM (Spanish convention)
  return { format: 'DD/MM/YYYY', ambiguous: true };
}
