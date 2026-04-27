// @vitest-environment jsdom
//
// WI-31c — renderer E2E-ish coverage for bulk classify.
//
// Drives `MovementsScreen` end-to-end through a jsdom + mocked IPC harness
// ("MSW-style" for the `window.opentreasury` bridge): simulates a real user
// selecting three movements, opening the Assign-Category modal, picking a
// Category + Subcategory, and clicking Aplicar. Asserts the full lifecycle
// the integration test cannot prove on its own — the exact IPC call shape,
// modal close + bar disappearance + selection clearing on success, and the
// opposite branches on failure (modal stays open, selection preserved).
//
// Accessibility: scans the screen (with bar visible) and the modal (open)
// through axe-core; zero violations is part of the acceptance criteria.
// The live-region count is asserted via `getByRole('status')`.
//
// Determinism:
//   - IPC is mocked end-to-end; no network, no filesystem.
//   - All ULIDs come through the existing `utils/ulid.js` seam, which we
//     mock with a fixed stub so assertions on the outgoing `correlationId`
//     are exact.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { run as axeRun } from 'axe-core';

import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord } from '../../types/config.js';
import type {
  BulkUpdateTransactionRequest,
  BulkUpdateTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';

// ---------------------------------------------------------------------------
// Module mocks — same "MSW-style" pattern as `MovementsScreen.test.tsx`:
// mock the renderer service modules so we can drive IPC responses from the
// test body while MovementsScreen thinks it's talking to the main process.
// ---------------------------------------------------------------------------
vi.mock('../../services/movementsApi.js', () => ({
  listMovements: vi.fn(),
}));
vi.mock('../../services/transactionApi.js', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  bulkUpdateTransactions: vi.fn(),
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

// Stable `newUlid` — the modal mints the `correlationId` through this seam.
// Mocking it lets us assert the exact value the renderer hands off to IPC.
const FIXED_CORRELATION_ID = '01HCOR0000000000000000CORR'.replace(/O/g, '0');
vi.mock('../../utils/ulid.js', () => ({
  newUlid: () => FIXED_CORRELATION_ID,
}));

import { listMovements } from '../../services/movementsApi.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import { bulkUpdateTransactions } from '../../services/transactionApi.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ACCOUNT_ID = '01HACC00000000000000000001';
const CAT1_ID = '01HCAT00000000000000000001';
const SUB1_ID = '01HSUB00000000000000000001';
const TX_IDS = [
  '01HTX000000000000000000TX01',
  '01HTX000000000000000000TX02',
  '01HTX000000000000000000TX03',
  '01HTX000000000000000000TX04',
  '01HTX000000000000000000TX05',
] as const;

const mockAccounts: Account[] = [
  {
    id: ACCOUNT_ID,
    bankName: 'Test Bank',
    bankNameShort: 'TB',
    accountLabel: 'Main',
    color: null,
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
  },
];

const mockCategories: CategoryRecord[] = [
  {
    id: CAT1_ID,
    name: 'Payroll',
    kind: 'expense',
    createdAt: '2026-04-01T00:00:00Z',
    subcategories: [
      {
        id: SUB1_ID,
        parentCategoryId: CAT1_ID,
        name: 'Salary',
        createdAt: '2026-04-01T00:00:00Z',
      },
    ],
  },
];

function makeMovement(i: number): MovementRecord {
  return {
    id: TX_IDS[i]!,
    date: `2026-04-2${i}`,
    type: i % 2 === 0 ? 'expense' : 'income',
    amount: 100 + i * 10,
    currency: 'EUR',
    description: `Transaction ${i + 1}`,
    accountId: ACCOUNT_ID,
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: `2026-04-20T10:0${i}:00Z`,
  };
}
const mockMovements: readonly MovementRecord[] = TX_IDS.map((_id, i) => makeMovement(i));

// jsdom has no HTMLDialogElement — stub the native methods the modal uses.
beforeEach(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal(): void {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close(): void {
        this.removeAttribute('open');
      };
    }
  }
  vi.mocked(getAccounts).mockResolvedValue({ accounts: mockAccounts });
  vi.mocked(listMovements).mockResolvedValue([...mockMovements]);
  vi.mocked(listCategories).mockResolvedValue({ categories: mockCategories });
  vi.mocked(listTags).mockResolvedValue({ tags: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

// Pin i18n to ES for the lifetime of this file, then restore — the i18n
// singleton is shared by every other renderer test file in the same vitest
// worker, so we must not leave it in ES (see review on #35).
const originalLanguage = i18n.language;
beforeAll(async () => {
  await i18n.changeLanguage('es');
});
afterAll(async () => {
  await i18n.changeLanguage(originalLanguage);
});

async function renderScreen(): Promise<void> {
  render(
    <I18nextProvider i18n={i18n}>
      <MovementsScreen />
    </I18nextProvider>,
  );
  await waitFor(() => {
    expect(screen.queryByRole('table')).not.toBeNull();
  });
}

function rowCheckboxes(): HTMLInputElement[] {
  return screen
    .getAllByRole('checkbox')
    .filter((cb): cb is HTMLInputElement => cb.classList.contains('ot-row-checkbox'));
}

function selectFirst(n: number): void {
  const boxes = rowCheckboxes();
  for (let i = 0; i < n; i += 1) {
    fireEvent.click(boxes[i]!);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('MovementsScreen — WI-31c bulk classify end-to-end', () => {
  it('shows the Spanish count in both the visible pill and the role="status" live region when 3 rows are selected', async () => {
    await renderScreen();
    selectFirst(3);

    const region = screen.getByRole('region', { name: /acciones en lote/i });
    expect(region).toBeDefined();
    // Visible pill — span with aria-hidden
    expect(region.textContent).toContain('3 movimientos seleccionados');
    // Live region queried via role="status" (per WI-31c AC).
    const live = within(region).getByRole('status');
    expect(live.textContent).toBe('3 movimientos seleccionados');
  });

  it('submits a single IPC call with the 3 ids, the chosen category/subcategory, and a ULID correlationId; clears selection and closes the modal on success', async () => {
    vi.mocked(bulkUpdateTransactions).mockResolvedValue({
      ok: true,
      updatedCount: 3,
      events: [],
    } as BulkUpdateTransactionResponse);

    await renderScreen();
    selectFirst(3);

    // Open the modal via the bar's primary CTA.
    const region = screen.getByRole('region', { name: /acciones en lote/i });
    const classifyBtn = within(region).getByRole('button', { name: /clasificar/i });
    fireEvent.click(classifyBtn);

    // Modal title reflects the count.
    const dialogTitle = await screen.findByRole('heading', { name: /clasificar 3 movimientos/i });
    expect(dialogTitle).toBeDefined();

    // Scope subsequent queries to the bulk-classify dialog — the screen also
    // contains the (closed) AddTransactionModal and a filter-bar "Categoría"
    // select, so a global `getByLabelText` would be ambiguous.
    const dialog = dialogTitle.closest('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    const categorySelect = within(dialog).getByLabelText('Categoría') as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: CAT1_ID } });
    const subcategorySelect = within(dialog).getByLabelText('Subcategoría') as HTMLSelectElement;
    fireEvent.change(subcategorySelect, { target: { value: SUB1_ID } });

    // Click Aplicar.
    fireEvent.click(within(dialog).getByRole('button', { name: /aplicar/i }));

    // IPC called exactly once with the expected shape.
    await waitFor(() => {
      expect(vi.mocked(bulkUpdateTransactions)).toHaveBeenCalledTimes(1);
    });
    const arg = vi.mocked(bulkUpdateTransactions).mock.calls[0]![0] as BulkUpdateTransactionRequest;
    // Rows render sorted by date DESC, so the first three checkboxes select
    // the three most-recent movements — TX_IDS[4], TX_IDS[3], TX_IDS[2].
    expect(new Set(arg.ids)).toEqual(new Set([TX_IDS[2], TX_IDS[3], TX_IDS[4]]));
    expect(arg.categoryId).toBe(CAT1_ID);
    expect(arg.subcategoryId).toBe(SUB1_ID);
    expect(arg.correlationId).toBe(FIXED_CORRELATION_ID);
    // Also prove we're handing a 26-char Crockford-base32 string to the bridge.
    expect(arg.correlationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    // Modal closes, bar disappears, selection cleared.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /clasificar \d+ movimientos?/i })).toBeNull();
    });
    expect(screen.queryByRole('region', { name: /acciones en lote/i })).toBeNull();

    // Panel query (movements list) re-fired — initial load + post-success reload.
    expect(vi.mocked(listMovements).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the failure list, keeps the modal open, and preserves the selection when IPC returns { ok: false, failures }', async () => {
    vi.mocked(bulkUpdateTransactions).mockResolvedValue({
      ok: false,
      failures: [
        {
          id: TX_IDS[0]!,
          code: 'TX_NOT_FOUND',
          message: 'transaction missing',
        },
      ],
    } as BulkUpdateTransactionResponse);

    await renderScreen();
    selectFirst(3);
    fireEvent.click(
      within(screen.getByRole('region', { name: /acciones en lote/i })).getByRole('button', {
        name: /clasificar/i,
      }),
    );
    const title = await screen.findByRole('heading', { name: /clasificar 3 movimientos/i });
    const dialog = title.closest('dialog') as HTMLDialogElement;
    fireEvent.change(within(dialog).getByLabelText('Categoría'), {
      target: { value: CAT1_ID },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /aplicar/i }));

    // Failure list appears inside the modal.
    await within(dialog).findByText(/TX_NOT_FOUND/i);
    expect(within(dialog).getByText(/transaction missing/i)).toBeDefined();

    // Modal is still mounted (title stays visible).
    expect(screen.getByRole('heading', { name: /clasificar 3 movimientos/i })).toBeDefined();
    // Bar is still visible → selection preserved.
    expect(screen.getByRole('region', { name: /acciones en lote/i })).toBeDefined();
  });

  it('axe-core: zero accessibility violations for the BulkActionsBar surface', async () => {
    await renderScreen();
    selectFirst(2);
    const region = screen.getByRole('region', { name: /acciones en lote/i });

    // Scope the scan to the new surface — the surrounding Table and filter
    // bar are existing code whose a11y is covered by their own tests; WI-31c
    // is responsible only for the bar + modal it introduces.
    const results = await axeRun(region);
    expect(
      results.violations,
      `axe violations:\n${results.violations.map((v) => `- ${v.id}: ${v.help}`).join('\n')}`,
    ).toEqual([]);
  });

  it('axe-core: zero accessibility violations for the open BulkClassifyModal', async () => {
    await renderScreen();
    selectFirst(3);
    fireEvent.click(
      within(screen.getByRole('region', { name: /acciones en lote/i })).getByRole('button', {
        name: /clasificar/i,
      }),
    );
    const title = await screen.findByRole('heading', { name: /clasificar 3 movimientos/i });
    const dialog = title.closest('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();

    const results = await axeRun(dialog, {
      // Colour-contrast needs a real pixel layout — jsdom doesn't supply it
      // (all styles resolve to rgba(0,0,0,0)), so axe reports false positives.
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(
      results.violations,
      `axe violations:\n${results.violations.map((v) => `- ${v.id}: ${v.help}`).join('\n')}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bulk-approve happy path — the BulkActionsBar exposes "Aprobar" alongside
// "Clasificar". Selecting a mix of pending + approved rows and confirming
// must call bulkUpdateTransactions exactly once with `{ status: 'approved' }`,
// only the pending IDs, a 26-char correlation id, and surface a success
// toast. Already-approved rows must be skipped (mentioned in the dialog,
// excluded from the IPC payload).
// ---------------------------------------------------------------------------
describe('MovementsScreen — bulk approve', () => {
  function makeMovementWithStatus(i: number, status: 'pending' | 'approved'): MovementRecord {
    return { ...makeMovement(i), status };
  }

  it('approves only pending selected rows, skips already-approved, and shows a success toast', async () => {
    const mixed: MovementRecord[] = [
      makeMovementWithStatus(0, 'pending'),
      makeMovementWithStatus(1, 'approved'),
      makeMovementWithStatus(2, 'pending'),
    ];
    vi.mocked(listMovements).mockResolvedValue([...mixed]);
    vi.mocked(bulkUpdateTransactions).mockResolvedValue({
      ok: true,
      updatedCount: 2,
      events: [],
      skippedSplitParentCount: 0,
    } as BulkUpdateTransactionResponse);

    await renderScreen();
    selectFirst(3);

    const region = screen.getByRole('region', { name: /acciones en lote/i });
    const approveBtn = within(region).getByRole('button', { name: /^aprobar$/i });
    fireEvent.click(approveBtn);

    // Confirm dialog opens with the pending count (2), and shows the skip
    // notice for the 1 already-approved selection.
    const dialogTitle = await screen.findByRole('heading', { name: /¿aprobar 2 movimientos\?/i });
    const dialog = dialogTitle.closest('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(within(dialog).getByText(/1 ya aprobado/i)).toBeDefined();

    fireEvent.click(within(dialog).getByRole('button', { name: /^aprobar$/i }));

    await waitFor(() => {
      expect(vi.mocked(bulkUpdateTransactions)).toHaveBeenCalledTimes(1);
    });
    const arg = vi.mocked(bulkUpdateTransactions).mock.calls[0]![0] as BulkUpdateTransactionRequest;
    // Only the two pending rows go to IPC. Order doesn't matter.
    expect(new Set(arg.ids)).toEqual(new Set([TX_IDS[0], TX_IDS[2]]));
    expect(arg.status).toBe('approved');
    expect(arg.correlationId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(arg.categoryId).toBeUndefined();

    // Dialog closes, selection cleared, success toast surfaces, and the
    // movements list is reloaded so the table reflects the new statuses.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /¿aprobar \d+ movimientos?\?/i })).toBeNull();
    });
    expect(screen.queryByRole('region', { name: /acciones en lote/i })).toBeNull();
    expect(screen.getByText(/se aprobaron 2 movimientos/i)).toBeDefined();
    expect(vi.mocked(listMovements).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
