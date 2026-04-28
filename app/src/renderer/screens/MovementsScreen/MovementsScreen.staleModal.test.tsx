// @vitest-environment jsdom
//
// Regression test for the "stale-modal-after-edit-save" bug originally
// fixed in PR #133 and reintroduced in production. Pedro's repro:
//
//   1. Open a transaction (modal in view mode).
//   2. Click "Editar" → edit mode.
//   3. Save (e.g. after toggling a tag).
//   4. The modal returns to view mode after loadAll() finishes — but
//      it shows the *pre-save* snapshot. The newly added label only
//      appears after closing and reopening the row.
//
// PR #133 attempted the fix with a sync `useEffect` that imperatively
// pushed the freshly loaded MovementRecord into `selectedTx` /
// `selectedRawRecord` state. Its bail-out check (`fresh ===
// selectedRawRecord`) plus React effect ordering around the
// loading→loaded flash meant the post-save view modal could still
// remount holding the pre-save snapshot, especially when the modal
// itself unmounts during the loading flash and remounts in view mode
// with the stale `selectedTx` prop frozen at row-click time.
//
// The new fix derives `selectedTx` and `selectedRawRecord` directly
// from `selectedId` + `rawRecordById` (the read-model lookup) —
// single source of truth, no imperative sync, no race window. This
// test pins that contract: when `loadAll()` rebuilds the read-model
// with an updated record, the open detail modal MUST render the
// freshest version, without anyone having to close-and-reopen it.
//
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
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

import { listMovements } from '../../services/movementsApi.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';

const TX_ID = 'mov-1';
const TAG_ID = 'tag-calendario';
const TAG_NAME = 'calendario';

const account: Account = {
  id: 'acc-1',
  bankName: 'Test Bank',
  bankNameShort: 'TestBank',
  accountLabel: 'Test Account 1',
  color: '#9b72cf',
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

function makeRecord(tagIds: readonly string[]): MovementRecord {
  return {
    id: TX_ID,
    date: '2026-04-15',
    type: 'expense',
    amount: 100.5,
    currency: 'EUR',
    description: 'Stale modal repro tx',
    accountId: 'acc-1',
    categoryId: null,
    subcategoryId: null,
    tagIds: tagIds.slice(),
    status: 'approved',
    createdAt: '2026-04-15T10:00:00Z',
  };
}

describe('MovementsScreen — stale modal after edit-save (PR #133 regression)', () => {
  // jsdom doesn't implement <dialog>; stub showModal/close.
  const proto = HTMLDialogElement.prototype as unknown as {
    showModal: () => void;
    close: () => void;
  };
  let originalShow: typeof proto.showModal;
  let originalClose: typeof proto.close;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    localStorage.clear();
    originalShow = proto.showModal;
    originalClose = proto.close;
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    vi.mocked(getAccounts).mockResolvedValue({ accounts: [account] });
    vi.mocked(listCategories).mockResolvedValue({ categories: [] });
    vi.mocked(listTags).mockResolvedValue({
      tags: [
        {
          id: TAG_ID,
          name: TAG_NAME,
          color: '#9b72cf',
          sortOrder: 0,
          createdAt: '2026-04-01T00:00:00Z',
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    proto.showModal = originalShow;
    proto.close = originalClose;
    vi.clearAllMocks();
  });

  it('open modal re-renders the freshly loaded record after loadAll() — no close/reopen needed', async () => {
    // First fetch: tx WITHOUT the "calendario" label.
    vi.mocked(listMovements).mockResolvedValueOnce([makeRecord([])]);

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <MovementsScreen configRevision={0} />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });

    // Open the detail modal by clicking the row.
    const descCell = await screen.findByText('Stale modal repro tx');
    const row = descCell.closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);

    // Wait for the modal's "Editar" footer button to confirm the
    // detail modal is open in view mode. Scope all subsequent queries
    // to this dialog so we don't see the always-mounted
    // AddTransactionModal's tag chip picker, which also contains
    // every tag name.
    const detailDialog = await waitFor(() => {
      const dlg = document.querySelector(
        'dialog[aria-labelledby="ot-transaction-detail-title"]',
      ) as HTMLElement | null;
      if (!dlg || !dlg.hasAttribute('open')) {
        throw new Error('detail modal not yet open');
      }
      return dlg;
    });

    // No tag yet on the open transaction — the view-mode tags row
    // shows the "none" placeholder, not "calendario".
    expect(detailDialog.textContent ?? '').not.toContain(TAG_NAME);

    // Now simulate the post-edit-save read-model refresh: queue a
    // listMovements response that includes the "calendario" label,
    // then bump `configRevision` so MovementsScreen re-runs loadAll.
    // The detail modal stays open the entire time. This mirrors the
    // sequence that follows handleSaveEdit() in production: the save
    // command resolves → loadAll() refetches → rawRecordById is
    // rebuilt with the updated record.
    vi.mocked(listMovements).mockResolvedValueOnce([makeRecord([TAG_ID])]);

    rerender(
      <I18nextProvider i18n={i18n}>
        <MovementsScreen configRevision={1} />
      </I18nextProvider>,
    );

    // The modal MUST reflect the newly applied label without anyone
    // having closed and reopened it. Before the fix this assertion
    // fails: the view modal continues to render the pre-save
    // snapshot of `selectedTx` captured at row-click time.
    await waitFor(
      () => {
        const dlg = document.querySelector(
          'dialog[aria-labelledby="ot-transaction-detail-title"]',
        ) as HTMLElement | null;
        expect(dlg).not.toBeNull();
        expect(dlg!.textContent ?? '').toContain(TAG_NAME);
      },
      { timeout: 3000 },
    );

    // listMovements should have been called twice (initial + revision bump).
    expect(listMovements).toHaveBeenCalledTimes(2);
  }, 10000);

  it('view modal reflects the freshly loaded record after handleSaveEdit (Pedro flow, with realistic IPC latency)', async () => {
    // Use REAL timers for this test so we can use setTimeout-backed
    // delays to simulate IPC latency. fakeTimers (Date-only) breaks
    // when waitFor relies on real-time setInterval polling.
    vi.useRealTimers();

    // Simulate IPC latency — 30ms — so the loadAll() loading flash
    // actually renders, exactly like in production. This is the
    // pattern that exposed PR #133's effect-ordering bug: the modal
    // unmounts during loading and remounts in view mode with the
    // pre-save selectedTx snapshot.
    const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

    let listMovementsCallCount = 0;
    vi.mocked(listMovements).mockImplementation(async () => {
      listMovementsCallCount += 1;
      await delay(30);
      return listMovementsCallCount === 1 ? [makeRecord([])] : [makeRecord([TAG_ID])];
    });

    const { updateTransaction } = await import('../../services/transactionApi.js');
    vi.mocked(updateTransaction).mockImplementation(async () => {
      await delay(20);
      return {
        ok: true,
        event: {
          type: 'tx.updated',
          id: '01HEVT00000000000000000001',
          txId: TX_ID,
          updatedAt: '2026-04-15T10:01:00Z',
          diff: {},
        },
      } as Awaited<ReturnType<typeof updateTransaction>>;
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MovementsScreen configRevision={0} />
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });

    const descCell = await screen.findByText('Stale modal repro tx');
    fireEvent.click(descCell.closest('tr')!);

    const detailDialog = await waitFor(() => {
      const dlg = document.querySelector(
        'dialog[aria-labelledby="ot-transaction-detail-title"]',
      ) as HTMLElement | null;
      if (!dlg || !dlg.hasAttribute('open')) {
        throw new Error('detail modal not yet open');
      }
      return dlg;
    });

    expect(detailDialog.textContent ?? '').not.toContain(TAG_NAME);

    const editBtn = within(detailDialog).getByRole('button', { name: /^editar$|^edit$/i });
    fireEvent.click(editBtn);

    const saveBtn = await waitFor(() =>
      within(detailDialog).getByRole('button', { name: /^guardar$|^save$/i }),
    );

    fireEvent.click(saveBtn);

    // Wait for the full save→loadAll cycle to complete with realistic
    // latency: updateTransaction (20ms) + loadAll (30ms) + render
    // commits. Then the detail modal MUST display the newly applied
    // "calendario" label.
    await waitFor(
      () => {
        const dlg = document.querySelector(
          'dialog[aria-labelledby="ot-transaction-detail-title"]',
        ) as HTMLElement | null;
        expect(dlg).not.toBeNull();
        expect(dlg!.textContent ?? '').toContain(TAG_NAME);
      },
      { timeout: 5000 },
    );
  }, 15000);
});
