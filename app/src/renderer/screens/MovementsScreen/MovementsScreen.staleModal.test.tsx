// @vitest-environment jsdom
//
// Tests for two layered contracts around the detail modal's data
// freshness and post-save lifecycle:
//
// 1) Derived-state freshness (PR #133 → #139). When the read-model
//    is rebuilt while the detail modal is OPEN (e.g. an external
//    configRevision bump from another panel), the modal MUST
//    re-render against the freshly loaded record — never the
//    snapshot frozen at row-click time. selectedTx / selectedRawRecord
//    are derived from `selectedId` + `rawRecordById` so the lookup
//    is always the source of truth.
//
// 2) Close-after-save UX (this PR). Pedro's directive (verbatim):
//      "Close everything — return to the transaction list
//       (simplest, no flash)"
//    After a successful edit-save the detail modal MUST close
//    entirely — selectedId cleared, no <dialog> rendered — so the
//    user lands back on the bare movements list. Prior behaviour
//    (modal remounts in view mode after loadAll()) caused a 1-2s
//    "Cargando" flash and an unwanted view-modal re-appearance.
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

describe('MovementsScreen — detail modal freshness + close-after-save UX', () => {
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

    // Now simulate an external read-model refresh while the detail
    // modal is open — e.g. a configRevision bump from another panel,
    // or any non-save-driven loadAll. The modal stays open the
    // entire time; queue a listMovements response that includes the
    // "calendario" label, then bump configRevision so MovementsScreen
    // re-runs loadAll. This pins the derived-state contract: the
    // open modal MUST re-render against `rawRecordById.get(selectedId)`
    // and reflect the fresh record without anyone closing/reopening.
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

  it('closes the detail modal entirely after handleSaveEdit (Pedro flow: no auto-reopen)', async () => {
    // Use REAL timers so the IPC-latency delays land on real time.
    vi.useRealTimers();

    // Mock localStorage to default to "all" time range instead of "this-month"
    // so the test movement (April 2026) isn't filtered out.
    localStorage.setItem('opentreasury:movements:dateFilter', JSON.stringify({ kind: 'all' }));

    // Simulate IPC latency — 30ms — so the loadAll() loading flash
    // actually renders, exactly like in production.
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

    const editBtn = within(detailDialog).getByRole('button', { name: /^editar$|^edit$/i });
    fireEvent.click(editBtn);

    const saveBtn = await waitFor(() =>
      within(detailDialog).getByRole('button', { name: /^guardar$|^save$/i }),
    );

    fireEvent.click(saveBtn);

    // After the save→loadAll cycle completes the detail modal MUST
    // be gone — Pedro's directive: close everything, return to the
    // bare list. No view modal, no edit modal, no "Cargando" flash
    // followed by a re-mount.
    await waitFor(
      () => {
        const dlg = document.querySelector(
          'dialog[aria-labelledby="ot-transaction-detail-title"]',
        ) as HTMLElement | null;
        // Either fully unmounted, or mounted-but-not-open. Both are
        // acceptable as "closed"; the user-visible effect is the same.
        if (dlg && dlg.hasAttribute('open')) {
          throw new Error('detail modal still open after save');
        }
      },
      { timeout: 5000 },
    );

    // The transactions table is still rendered — user lands on the
    // bare list, not on a loading screen. Wrap in waitFor since the
    // post-save loadAll may still be flushing its final commit when
    // the dialog-closed assertion above resolves.
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });

    // updateTransaction was called exactly once (the save), and the
    // post-save loadAll fired the second listMovements (call #2).
    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(listMovementsCallCount).toBeGreaterThanOrEqual(2);
  }, 15000);
});
