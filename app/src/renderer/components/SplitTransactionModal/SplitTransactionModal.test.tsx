// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { SplitTransactionModal } from './SplitTransactionModal.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';

// jsdom doesn't implement HTMLDialogElement.showModal; stub to no-op.
beforeEach(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute('open');
      };
    }
  }
});

vi.mock('../../services/splitsApi.js', () => ({
  getSplits: vi.fn().mockResolvedValue({ ok: true, splits: [] }),
  createSplit: vi.fn(),
  removeSplit: vi.fn(),
}));

const baseTx: MovementRecord = {
  id: '01HZTX00000000000000000000',
  date: '2026-04-20',
  type: 'expense',
  amount: 300,
  currency: 'EUR',
  description: 'Test',
  accountId: '01HACC0000000000000000ACC1',
  categoryId: null,
  subcategoryId: null,
  tagIds: [],
  status: 'approved',
  createdAt: '2026-04-20T10:32:00Z',
};

// Regression — Pedro hit the unfiltered keystroke issue on the transaction
// form and called out splits as the other place that takes amount strings.
// `handleAmountChange` already parses with `parseLocaleAmount`; the guard
// just prevents the raw input from filling up with garbage like `1.....,2,..`.
describe('SplitTransactionModal — amount keystroke sanitization (ES locale sweep)', () => {
  it('silently rejects garbage keystrokes in a split amount input', async () => {
    render(
      <I18nextProvider i18n={i18n}>
        <SplitTransactionModal
          isOpen={true}
          onClose={vi.fn()}
          transaction={baseTx}
          onSplitSaved={vi.fn()}
        />
      </I18nextProvider>,
    );

    // Two empty split rows are seeded on open for a fresh (no-splits) tx.
    const inputs = await waitFor(() => {
      const found = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[id^="split-amount-"]'),
      );
      if (found.length < 2) throw new Error('split amount inputs not ready');
      return found;
    });

    const first = inputs[0]!;

    fireEvent.change(first, { target: { value: '1331,85' } });
    expect(first.value).toBe('1331,85');

    fireEvent.change(first, { target: { value: '1.....,2,..' } });
    expect(first.value).toBe('1331,85');
    fireEvent.change(first, { target: { value: '1..2' } });
    expect(first.value).toBe('1331,85');
    fireEvent.change(first, { target: { value: 'abc' } });
    expect(first.value).toBe('1331,85');
  });
});
