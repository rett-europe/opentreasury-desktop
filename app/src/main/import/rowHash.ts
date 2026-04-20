// Row-hash algorithm for import deduplication — WI-17.
//
// Computes a deterministic 16-char hex hash from accountId + date + amount + description.
// Used to detect duplicate rows across imports (idempotent import).

import { createHash } from 'node:crypto';

/**
 * Compute row hash for import deduplication.
 *
 * @param accountId - ULID of the destination account
 * @param date - ISO 8601 date string (YYYY-MM-DD)
 * @param amount - Numeric amount (will be normalized to absolute value, 2 decimals)
 * @param description - Raw description string (will be normalized)
 * @returns 16-character hex hash
 */
export function computeRowHash(
  accountId: string,
  date: string,
  amount: number,
  description: string,
): string {
  // Normalize amount: absolute value, fixed 2 decimals
  const amountNormalized = Math.abs(amount).toFixed(2);

  // Normalize description: trim, lowercase, collapse whitespace, normalize line breaks
  const descriptionNormalized = description
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const input = `${accountId}|${date}|${amountNormalized}|${descriptionNormalized}`;

  return createHash('sha256').update(input, 'utf8').digest('hex').substring(0, 16);
}
