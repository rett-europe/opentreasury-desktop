// @vitest-environment jsdom
//
// Regression test for trial.3.11 bug: the Movimientos search box did not
// match against transaction notes. The MovementsScreen now bulk-fetches
// notes during loadAll() and feeds them into the search-index lookup
// tables; this test proves the wiring end-to-end by:
//
//   1. Seeding two transactions whose only difference (relative to the
//      query string) is that ONE of them has a note containing that string.
//      No other field — description / reference / details / category /
//      subcategory / tag — contains the query token.
//   2. Mounting MovementsScreen with `searchQuery` pre-set to that token.
//   3. Asserting the matching transaction's description appears in the
//      table and the non-matching one does not.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';

vi.mock('../../services/movementsApi.js', () => ({
  listMovements: vi.fn(),
}));
vi.mock('../../services/transactionApi.js', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  bulkUpdateTransactions: vi.fn(),
  bulkAddLabelToTransactions: vi.fn(),
}));
vi.mock('../../services/panelApi.js', () => ({
  getAccounts: vi.fn(),
}));
vi.mock('../../services/categoriesApi.js', () => ({
  listCategories: vi.fn(),
}));
vi.mock('../../services/tagsApi.js', () => ({
  listTags: vi.fn(),
}));
vi.mock('../../services/notesApi.js', () => ({
  listAllNotes: vi.fn(),
}));

import { listMovements } from '../../services/movementsApi.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import { listAllNotes } from '../../services/notesApi.js';

const ACCOUNT_ID = '01HACC00000000000000000001';
const TX_WITH_NOTE = '01HTX00000000000000WITHNOTE';
const TX_PLAIN = '01HTX0000000000000000PLAIN1';

const mockAccounts: Account[] = [
  {
    id: ACCOUNT_ID,
    bankName: 'Test Bank',
    bankNameShort: 'TB',
    accountLabel: 'Main',
    color: '#9b72cf',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
  },
];

const mockMovements: MovementRecord[] = [
  {
    id: TX_WITH_NOTE,
    date: '2026-04-15',
    type: 'expense',
    amount: 42.0,
    currency: 'EUR',
    // Description deliberately uses tokens that do NOT match the search
    // query — the only place the query appears is in the attached note.
    description: 'Generic vendor payment',
    accountId: ACCOUNT_ID,
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-04-15T10:00:00Z',
  },
  {
    id: TX_PLAIN,
    date: '2026-04-16',
    type: 'expense',
    amount: 7.5,
    currency: 'EUR',
    description: 'Another vendor payment',
    accountId: ACCOUNT_ID,
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-04-16T10:00:00Z',
  },
];

describe('MovementsScreen — search matches transaction notes', () => {
  beforeEach(() => {
    // Pin clock so the default "this month" date filter includes our fixtures.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    localStorage.clear();

    vi.mocked(getAccounts).mockResolvedValue({ accounts: mockAccounts });
    vi.mocked(listMovements).mockResolvedValue(mockMovements);
    vi.mocked(listCategories).mockResolvedValue({ categories: [] });
    vi.mocked(listTags).mockResolvedValue({ tags: [] });
    vi.mocked(listAllNotes).mockResolvedValue({
      ok: true,
      notesByTxId: {
        [TX_WITH_NOTE]: [
          {
            id: '01HNOTE0000000000000000001',
            txId: TX_WITH_NOTE,
            text: 'Confirmed reimbursement with Donor Pingponguero.',
            createdAt: '2026-04-15T11:00:00Z',
          },
        ],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.resetAllMocks();
  });

  it('finds a transaction whose only match is in its notes', async () => {
    // "pingponguero" appears ONLY inside the note text, nowhere else.
    render(
      <I18nextProvider i18n={i18n}>
        <MovementsScreen searchQuery="pingponguero" />
      </I18nextProvider>,
    );

    // Wait for the screen to finish loading and the bulk-notes call to land.
    await waitFor(() => {
      expect(listAllNotes).toHaveBeenCalled();
    });

    // The transaction with the matching note should render in the table.
    await waitFor(() => {
      expect(screen.queryByText('Generic vendor payment')).not.toBeNull();
    });

    // The other transaction should be filtered out — its description does
    // not contain the search query and it has no matching note.
    expect(screen.queryByText('Another vendor payment')).toBeNull();
  });

  it('still renders rows when the bulk-notes handler is unavailable', async () => {
    // Simulate an older main process that hasn't shipped the listAll handler:
    // the renderer's `.catch(...)` fallback returns an empty notesByTxId so
    // the table still loads (search just can't match notes on this build).
    vi.mocked(listAllNotes).mockRejectedValueOnce(new Error('handler missing'));

    render(
      <I18nextProvider i18n={i18n}>
        <MovementsScreen />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText('Generic vendor payment')).not.toBeNull();
      expect(screen.queryByText('Another vendor payment')).not.toBeNull();
    });
  });
});
