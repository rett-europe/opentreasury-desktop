// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { TransactionDetailModal } from './TransactionDetailModal.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';

// jsdom doesn't implement HTMLDialogElement.showModal; stub to no-op so the
// component doesn't throw when it tries to open.
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

const mockAccount: Account = {
  id: '01HACC0000000000000000ACC1',
  bankName: 'Test Bank',
  bankNameShort: 'TestBank',
  accountLabel: 'Ops Account',
  color: '#9b72cf',
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const baseTx: RecentTransaction = {
  id: '01HZTX00000000000000000000',
  date: '2026-04-20',
  type: 'income',
  amount: 150,
  currency: 'EUR',
  description: 'Donation RETT Europe',
  accountId: mockAccount.id,
  categoryId: null,
  subcategoryId: null,
  tagIds: [],
  status: 'approved',
  createdAt: '2026-04-20T10:32:00Z',
};

function mountBridge(): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    transaction: {
      note: {
        add: vi.fn(),
        list: vi.fn().mockResolvedValue({ ok: true, notes: [] }),
        edit: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
}

describe('TransactionDetailModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mountBridge();
  });

  function renderModal(
    tx: RecentTransaction | null,
    props?: { onUpdate?: () => void; onDelete?: () => void },
  ) {
    return render(
      <I18nextProvider i18n={i18n}>
        <TransactionDetailModal
          isOpen={tx !== null}
          onClose={() => {}}
          transaction={tx}
          accounts={[mockAccount]}
          onUpdate={props?.onUpdate ?? vi.fn()}
          onDelete={props?.onDelete ?? vi.fn()}
        />
      </I18nextProvider>,
    );
  }

  it('renders read-only view by default', async () => {
    renderModal(baseTx);
    expect(await screen.findByText('Donation RETT Europe')).toBeTruthy();
    // Amount rendered via Intl — find the specific amount node by its class.
    const amountNode = document.querySelector('.ot-transaction-detail-modal__amount');
    expect(amountNode).not.toBeNull();
    expect(amountNode?.textContent).toMatch(/150/);
    // Edit button should be visible in read-only mode
    expect(screen.getByRole('button', { name: /Edit|Editar/i })).toBeTruthy();
  });

  it('swaps to edit mode when Edit button is clicked (in-place swap, no second modal)', () => {
    renderModal(baseTx);
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // After clicking Edit, the same modal should now show the form fields
    // The modal title should change from "Transaction detail" to "Edit Transaction"
    expect(
      screen.getByRole('heading', { name: /Edit Transaction|Editar Movimiento/i }),
    ).toBeTruthy();

    // Edit mode shows editable metadata fields (Account, Category, Status, etc.)
    // Date/Description/Amount remain read-only in summary header (same as view mode)
    expect(screen.getByLabelText(/Account|Cuenta/i)).toBeTruthy();
    expect(screen.getByLabelText(/Status|Estado/i)).toBeTruthy();

    // Footer should now show "Cancel" and "Save" buttons instead of "Edit" and "Close"
    expect(screen.getByRole('button', { name: /Cancel|Cancelar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save|Guardar/i })).toBeTruthy();

    // Original "Edit" button should no longer be visible
    expect(screen.queryByRole('button', { name: /^Edit$|^Editar$/i })).toBeNull();

    // Delete button should be hidden during edit mode
    expect(screen.queryByRole('button', { name: /Delete|Eliminar/i })).toBeNull();
  });

  it('reverts to read-only mode when Cancel is clicked', () => {
    renderModal(baseTx);
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // Now in edit mode
    const cancelButton = screen.getByRole('button', { name: /Cancel|Cancelar/i });
    fireEvent.click(cancelButton);

    // Should be back to read-only mode — Edit button visible again
    expect(screen.getByRole('button', { name: /Edit|Editar/i })).toBeTruthy();
    // Save/Cancel buttons should be gone
    expect(screen.queryByRole('button', { name: /Cancel|Cancelar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save|Guardar/i })).toBeNull();
  });

  it('shows reference and details blocks when present', () => {
    renderModal({ ...baseTx, reference: 'INV-2026-0042', details: 'Monthly donation' });
    expect(screen.getByText('INV-2026-0042')).toBeTruthy();
    expect(screen.getByText('Monthly donation')).toBeTruthy();
  });

  it('renders the account as a pill with a color dot (matching the table)', () => {
    const { container } = renderModal(baseTx);
    const pill = container.querySelector('.ot-account-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toMatch(/Ops Account/);
    expect(pill?.querySelector('.ot-account-pill__dot')).not.toBeNull();
  });

  it('renders the status inside an ot-badge--{status} badge', () => {
    const { container } = renderModal({ ...baseTx, status: 'pending' });
    const badge = container.querySelector('.ot-badge.ot-badge--pending');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toMatch(/Pending|Pendiente/);
  });

  it('renders an uncategorized badge when the transaction has no category', () => {
    const { container } = renderModal(baseTx);
    const badge = container.querySelector('.ot-badge.ot-badge--uncategorized');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toMatch(/Uncategorized|Sin categorizar/);
  });

  it('renders tag chips when the transaction has tags', () => {
    const { container } = renderModal({ ...baseTx, tagIds: ['tag-a', 'tag-b', 'tag-c'] });
    const chips = container.querySelectorAll('.ot-tag-chip');
    expect(chips.length).toBe(3);
  });

  it('renders a muted placeholder for tags when the transaction has no tags', () => {
    const { container } = renderModal(baseTx);
    // No chip row when there are no tags.
    expect(container.querySelector('.ot-tag-chip')).toBeNull();
  });

  it('renders reference as a standalone extra block (matching the details block styling)', () => {
    const { container } = renderModal({ ...baseTx, reference: 'INV-2026-0042' });
    const refCell = screen.getByText('INV-2026-0042');
    // Reference is rendered as a standalone "extra" section (matching Details),
    // NOT inside the metadata two-column grid.
    expect(refCell.closest('.ot-transaction-detail-modal__grid')).toBeNull();
    expect(refCell.closest('.ot-transaction-detail-modal__extra')).not.toBeNull();
    // Both Reference and Details use the shared longtext block class.
    const longtextBlocks = container.querySelectorAll('.ot-transaction-detail-modal__longtext');
    expect(longtextBlocks.length).toBe(2);
  });

  it('always renders Reference and Details labels (with `—` placeholder) when values are null/undefined', () => {
    renderModal(baseTx);
    // The literal values are absent
    expect(screen.queryByText('INV-2026-0042')).toBeNull();
    expect(screen.queryByText('Monthly donation')).toBeNull();
    // But both labels are still rendered (with the `—` placeholder)
    // so users always see all metadata fields at a glance.
    expect(screen.getByText(/^Reference$|^Referencia$/)).toBeTruthy();
    expect(screen.getByText(/^Details$|^Detalles$/)).toBeTruthy();
  });

  it('renders notes thread container in read-only mode', () => {
    renderModal(baseTx);
    // The thread heading uses the `notes.heading` i18n key.
    expect(screen.getByRole('heading', { name: /Notes|Notas/i })).toBeTruthy();
  });

  it('hides notes thread in edit mode (edit body takes over)', () => {
    renderModal(baseTx);
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // Notes thread should not be visible in edit mode
    expect(screen.queryByRole('heading', { name: /Notes|Notas/i })).toBeNull();
  });

  it('preserves category and subcategory ULIDs when entering edit mode', async () => {
    const mockCategories = [
      {
        id: '01HCAT00000000000000000001',
        name: 'Payroll',
        type: 'expense' as const,
        subcategories: [{ id: '01HCAT00000000000000000002', name: 'Staff costs' }],
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    const txWithCategory: RecentTransaction = {
      ...baseTx,
      categoryId: '01HCAT00000000000000000001',
      subcategoryId: '01HCAT00000000000000000002',
    };

    const handleUpdate = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nextProvider i18n={i18n}>
        <TransactionDetailModal
          isOpen={true}
          onClose={() => {}}
          transaction={txWithCategory}
          accounts={[mockAccount]}
          categories={mockCategories}
          onUpdate={handleUpdate}
          onDelete={vi.fn()}
        />
      </I18nextProvider>,
    );

    // Enter edit mode
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // Category dropdown should have the correct ULID selected
    const categorySelect = document.getElementById('tx-category') as HTMLSelectElement;
    expect(categorySelect).not.toBeNull();
    expect(categorySelect.value).toBe('01HCAT00000000000000000001');

    // Subcategory dropdown should have the correct ULID selected
    const subcategorySelect = document.getElementById('tx-subcategory') as HTMLSelectElement;
    expect(subcategorySelect).not.toBeNull();
    expect(subcategorySelect.value).toBe('01HCAT00000000000000000002');

    // Add a tag (simulating Pedro's scenario of "adding a label")
    // For simplicity, we'll just save without changing anything
    const saveButton = screen.getByRole('button', { name: /Save|Guardar/i });
    fireEvent.click(saveButton);

    // Wait for the async save to complete
    await vi.waitFor(() => {
      expect(handleUpdate).toHaveBeenCalled();
    });

    // Verify that the update was called with the correct ULIDs (not empty strings)
    const updateCall = handleUpdate.mock.calls[0][0];
    expect(updateCall.categoryId).toBe('01HCAT00000000000000000001');
    expect(updateCall.subcategoryId).toBe('01HCAT00000000000000000002');
  });

  // SPEC-025 — Status-based field locks ----------------------------------------
  describe('SPEC-025 — status-based edit locks', () => {
    it('AC1: pending transaction shows editable Date/Description/Amount/Account', () => {
      renderModal({ ...baseTx, status: 'pending' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const dateInput = document.getElementById('tx-date') as HTMLInputElement;
      const descInput = document.getElementById('tx-description') as HTMLInputElement;
      const amtInput = document.getElementById('tx-amount') as HTMLInputElement;
      const accSelect = document.getElementById('tx-account') as HTMLSelectElement;
      expect(dateInput).toBeTruthy();
      expect(dateInput.disabled).toBe(false);
      expect(descInput.disabled).toBe(false);
      expect(amtInput.disabled).toBe(false);
      expect(accSelect.disabled).toBe(false);
    });

    it('AC2: approved transaction locks Date/Description/Amount/Account with hint', () => {
      renderModal({ ...baseTx, status: 'approved' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const dateInput = document.getElementById('tx-date') as HTMLInputElement;
      const descInput = document.getElementById('tx-description') as HTMLInputElement;
      const amtInput = document.getElementById('tx-amount') as HTMLInputElement;
      const accSelect = document.getElementById('tx-account') as HTMLSelectElement;
      expect(dateInput.disabled).toBe(true);
      expect(descInput.disabled).toBe(true);
      expect(amtInput.disabled).toBe(true);
      expect(accSelect.disabled).toBe(true);

      // Hint is visually hidden but present in DOM for screen readers
      const dateHint = document.getElementById('lock-hint-date');
      expect(dateHint).not.toBeNull();
      expect(dateHint?.classList.contains('ot-sr-only')).toBe(true);
      expect(dateHint?.textContent).toMatch(/Set status to Pending/i);

      // aria-describedby wired up on the date input
      expect(dateInput.getAttribute('aria-describedby')).toBe('lock-hint-date');
    });

    it('AC3: flipping Status from approved → pending mid-modal unlocks fields immediately', () => {
      renderModal({ ...baseTx, status: 'approved' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const dateInput = document.getElementById('tx-date') as HTMLInputElement;
      expect(dateInput.disabled).toBe(true);

      // Flip status to pending in the dropdown — no save, no reopen.
      const statusSelect = document.getElementById('tx-status') as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'pending' } });

      const dateAfter = document.getElementById('tx-date') as HTMLInputElement;
      expect(dateAfter.disabled).toBe(false);
      // Hint should be gone for the date field
      expect(document.getElementById('lock-hint-date')).toBeNull();
    });

    it('AC4: flipping Status from pending → approved mid-modal does NOT lock fields', () => {
      renderModal({ ...baseTx, status: 'pending' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const statusSelect = document.getElementById('tx-status') as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'approved' } });

      const dateInput = document.getElementById('tx-date') as HTMLInputElement;
      expect(dateInput.disabled).toBe(false);
    });

    it('AC5: saving with status flip + edits emits one update call carrying both', async () => {
      const handleUpdate = vi.fn().mockResolvedValue(undefined);
      renderModal({ ...baseTx, status: 'approved' }, { onUpdate: handleUpdate });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      // Unlock by flipping status
      const statusSelect = document.getElementById('tx-status') as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'pending' } });

      // Edit description
      const descInput = document.getElementById('tx-description') as HTMLInputElement;
      fireEvent.change(descInput, { target: { value: 'Corrected description' } });

      fireEvent.click(screen.getByRole('button', { name: /Save|Guardar/i }));
      await vi.waitFor(() => expect(handleUpdate).toHaveBeenCalled());

      const call = handleUpdate.mock.calls[0][0];
      expect(call.status).toBe('pending');
      expect(call.description).toBe('Corrected description');
      expect(handleUpdate).toHaveBeenCalledTimes(1);
    });

    it('AC9 / hide-banner: pending edit body hides the summary banner', () => {
      renderModal({ ...baseTx, status: 'pending' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));
      // Edit body summary banner should NOT render for pending.
      const editBody = document.querySelector('.ot-transaction-detail-modal__edit-body');
      expect(editBody).toBeTruthy();
      expect(editBody?.querySelector('.ot-transaction-detail-modal__summary')).toBeNull();
    });

    it('AC9 / show-banner: approved edit body keeps the summary banner', () => {
      renderModal({ ...baseTx, status: 'approved' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));
      const editBody = document.querySelector('.ot-transaction-detail-modal__edit-body');
      expect(editBody?.querySelector('.ot-transaction-detail-modal__summary')).toBeTruthy();
    });

    it('Cancel reverts in-modal status flip (resets on next edit open)', () => {
      renderModal({ ...baseTx, status: 'approved' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const statusSelect = document.getElementById('tx-status') as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'pending' } });
      expect(statusSelect.value).toBe('pending');

      // Cancel
      fireEvent.click(screen.getByRole('button', { name: /Cancel|Cancelar/i }));

      // Re-open edit
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));
      const statusSelectAfter = document.getElementById('tx-status') as HTMLSelectElement;
      expect(statusSelectAfter.value).toBe('approved');
      // And fields are locked again
      const dateInput = document.getElementById('tx-date') as HTMLInputElement;
      expect(dateInput.disabled).toBe(true);
    });
  });

  // Regression — trial.3.12 "frozen inputs" bug ------------------------------
  //
  // Bug: after editing ~3 transactions in a row, every input box in the app
  // stopped accepting keyboard input. Root cause was the parent
  // (MovementsScreen) unmounting this modal while the underlying <dialog>
  // was still in showModal() state — Chromium's top-layer ownership leaked
  // and the rest of the page stayed `inert`.
  //
  // Layer-1 contract enforced here: if React unmounts us with the dialog
  // still open, the cleanup forcibly closes it so the top layer is
  // released. The MovementsScreen integration test covers Layer 2 (the
  // modal staying mounted across loading transitions).
  describe('unmount cleanup (frozen-inputs regression)', () => {
    it('closes the dialog when the component unmounts while still open', () => {
      const { unmount, container } = renderModal(baseTx);

      const dialog = container.querySelector('dialog') as HTMLDialogElement | null;
      expect(dialog).not.toBeNull();
      // The mount effect should have opened the dialog via showModal()
      // (stubbed in beforeEach to set the `open` attribute).
      expect(dialog?.hasAttribute('open')).toBe(true);

      unmount();

      // The cleanup effect from useCloseDialogOnUnmount must have invoked
      // dialog.close() (stubbed to remove the `open` attribute) so the
      // browser releases the top layer. Without this, the page would stay
      // inert and inputs would freeze app-wide.
      expect(dialog?.hasAttribute('open')).toBe(false);
    });

    it('is a no-op when the dialog is already closed at unmount', () => {
      const { unmount, container } = renderModal(null); // isOpen=false

      const dialog = container.querySelector('dialog') as HTMLDialogElement | null;
      expect(dialog).not.toBeNull();
      expect(dialog?.hasAttribute('open')).toBe(false);

      // Should not throw or change anything.
      expect(() => unmount()).not.toThrow();
    });
  });

  // ES locale sweep — regression for the comma-decimal bug Pedro hit during
  // trial.3.13 integration testing. The edit-mode amount input must accept
  // both `1331,85` (Spanish decimal) and `1.331,85` (Spanish thousands +
  // decimal) and forward the correct numeric value to the IPC update handler.
  describe('comma-decimal amount input (ES locale sweep)', () => {
    async function editAmountAndSave(typed: string) {
      const handleUpdate = vi.fn().mockResolvedValue(undefined);
      // Start with a `pending` transaction so amount is editable (SPEC-025 lock).
      renderModal({ ...baseTx, status: 'pending' }, { onUpdate: handleUpdate });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const amountInput = document.getElementById('tx-amount') as HTMLInputElement;
      expect(amountInput).not.toBeNull();
      // The input must be text + decimal inputMode so the browser accepts comma.
      expect(amountInput.type).toBe('text');
      expect(amountInput.inputMode).toBe('decimal');

      fireEvent.change(amountInput, { target: { value: typed } });
      // The user's raw typed string round-trips in state — no silent coercion.
      expect(amountInput.value).toBe(typed);

      fireEvent.click(screen.getByRole('button', { name: /Save|Guardar/i }));
      await vi.waitFor(() => expect(handleUpdate).toHaveBeenCalled());
      return handleUpdate.mock.calls[0]![0];
    }

    it('parses `1331,85` (Spanish decimal) into 1331.85 for the IPC update', async () => {
      const call = await editAmountAndSave('1331,85');
      expect(call.amount).toBe(1331.85);
    });

    it('parses `1.331,85` (Spanish thousands + decimal) into 1331.85 for the IPC update', async () => {
      const call = await editAmountAndSave('1.331,85');
      expect(call.amount).toBe(1331.85);
    });

    it('silently rejects garbage keystrokes (e.g. `1..2`) — input value is unchanged', () => {
      renderModal({ ...baseTx, status: 'pending' });
      fireEvent.click(screen.getByRole('button', { name: /Edit|Editar/i }));

      const amountInput = document.getElementById('tx-amount') as HTMLInputElement;
      expect(amountInput).not.toBeNull();

      // Baseline value from the seeded tx is `150` (RecentTransaction.amount.toString()).
      const baseline = amountInput.value;
      expect(baseline).toBe('150');

      // Garbage gets dropped by the guard — React doesn't update state, so the
      // input reverts to the last good value on each rejected keystroke.
      fireEvent.change(amountInput, { target: { value: '1.....,2,..' } });
      expect(amountInput.value).toBe(baseline);
      fireEvent.change(amountInput, { target: { value: '1..2' } });
      expect(amountInput.value).toBe(baseline);
      fireEvent.change(amountInput, { target: { value: 'abc' } });
      expect(amountInput.value).toBe(baseline);
    });
  });
});
