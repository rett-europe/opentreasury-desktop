/**
 * Status → badge class mapping, shared between `TransactionsTable` and
 * `TransactionDetailModal` so the visual treatment can't drift.
 *
 * Returns the full class string (base + modifier) ready to drop onto a
 * `<span>`.
 */

import type { TransactionRowStatus } from '../components/TransactionsTable/TransactionsTable.js';

export function getStatusBadgeClass(status: TransactionRowStatus): string {
  if (status === 'pending') return 'ot-badge ot-badge--pending';
  if (status === 'rejected') return 'ot-badge ot-badge--rejected';
  return 'ot-badge ot-badge--approved';
}
