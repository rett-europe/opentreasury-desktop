// @vitest-environment jsdom
//
// trial.3.13 — covers the opening-balance edit flow lifted in PR #341.
// In edit mode the input is always editable. When the user changes it on
// an account that already has transactions the modal opens a ConfirmDialog
// summarising the delta before firing the IPC. When usage_count === 0 the
// IPC fires directly.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { AddAccountModal } from './AddAccountModal.js';
import type { AccountRecord } from '../../../shared/ipc-contracts/accounts.js';

// jsdom lacks HTMLDialogElement.showModal/close — same shim the other modal
// tests use (see ConfirmDialog.test.tsx).
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

const RECORD: AccountRecord = {
  id: '01ABC',
  name: 'Wrong opening',
  currency: 'EUR',
  openingBalance: 0,
  sortOrder: 0,
  createdAt: '2026-04-19T10:00:00.000Z',
};

interface BridgeStubs {
  readonly update: ReturnType<typeof vi.fn>;
}

function stubBridge(): BridgeStubs {
  const update = vi.fn().mockResolvedValue({
    ok: true,
    event: {
      type: 'AccountUpdated',
      id: 'evt-1',
      accountId: RECORD.id,
      changes: {},
      updatedAt: '2026-05-29T00:00:00.000Z',
    },
  });
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    accounts: {
      // Not exercised in these tests but the surface check expects it.
      list: vi.fn(),
      create: vi.fn(),
      update,
      archive: vi.fn(),
      unarchive: vi.fn(),
    },
  };
  return { update };
}

interface RenderResult {
  readonly onSaved: ReturnType<typeof vi.fn>;
  readonly onClose: ReturnType<typeof vi.fn>;
  readonly bridge: BridgeStubs;
}

async function renderEdit(
  usageCount: number,
  record: AccountRecord = RECORD,
): Promise<RenderResult> {
  const bridge = stubBridge();
  const onSaved = vi.fn();
  const onClose = vi.fn();
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  render(
    <I18nextProvider i18n={i18n}>
      <AddAccountModal
        isOpen
        mode="edit"
        record={record}
        usageCount={usageCount}
        onClose={onClose}
        onSaved={onSaved}
      />
    </I18nextProvider>,
  );
  return { onSaved, onClose, bridge };
}

function getOpeningInput(): HTMLInputElement {
  // Bypass label-based lookup — the ConfirmDialog title contains "opening
  // balance" too (it's always in the DOM, just hidden via the <dialog>
  // open attribute), so getByLabelText finds multiple matches.
  const input = document.getElementById('acc-opening') as HTMLInputElement | null;
  if (!input) throw new Error('acc-opening input not found');
  return input;
}

function changeOpeningBalanceInput(value: string): void {
  fireEvent.change(getOpeningInput(), { target: { value } });
}

function clickSave(): void {
  // ConfigModalShell renders a single "Save" button.
  fireEvent.click(screen.getByRole('button', { name: /Save/i }));
}

function getConfirmDialog(): HTMLDialogElement | null {
  return document.querySelector('dialog.ot-confirm-dialog') as HTMLDialogElement | null;
}

function isConfirmDialogOpen(): boolean {
  return getConfirmDialog()?.hasAttribute('open') === true;
}

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as unknown as { opentreasury?: unknown }).opentreasury;
});

describe('AddAccountModal — edit mode', () => {
  it('keeps the opening balance input editable (no readOnly/disabled)', async () => {
    await renderEdit(5);
    const input = getOpeningInput();
    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(false);
  });

  it('shows the recompute-warning hint instead of the legacy immutable text', async () => {
    await renderEdit(5);
    expect(
      screen.getByText(/Changing the opening balance will recompute the current balance/i),
    ).toBeTruthy();
    expect(screen.queryByText(/can't be changed after account creation/i)).toBeNull();
  });
});

describe('AddAccountModal — opening-balance change confirmation', () => {
  it('opens a ConfirmDialog with the localized delta when usage_count > 0', async () => {
    await renderEdit(7);
    changeOpeningBalanceInput('1331.85');
    clickSave();

    expect(isConfirmDialogOpen()).toBe(true);
    // Title is rendered inside the confirm dialog.
    const dialog = getConfirmDialog()!;
    expect(dialog.textContent).toContain('Change opening balance');
    // The body interpolates the count + locale-formatted amounts.
    expect(dialog.textContent).toContain('7 transaction(s)');
    expect(dialog.textContent).toContain('1,331.85');
    expect(dialog.textContent).toMatch(/shift the current balance/);
  });

  it('cancel keeps the modal open with the in-flight value preserved', async () => {
    const { bridge, onSaved, onClose } = await renderEdit(7);
    changeOpeningBalanceInput('1331.85');
    clickSave();
    expect(isConfirmDialogOpen()).toBe(true);

    const dialog = getConfirmDialog()!;
    const cancelBtn = dialog.querySelector(
      '.ot-confirm-dialog__cancel',
    ) as HTMLButtonElement | null;
    expect(cancelBtn).not.toBeNull();
    fireEvent.click(cancelBtn!);

    // No IPC, no save callbacks — and the value the user typed is still
    // sitting in the field for them to adjust and retry.
    expect(bridge.update).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(getOpeningInput().value).toBe('1331.85');
    expect(isConfirmDialogOpen()).toBe(false);
  });

  it('confirming fires accounts:update with the new openingBalance and closes', async () => {
    const { bridge, onSaved, onClose } = await renderEdit(7);
    changeOpeningBalanceInput('1331.85');
    clickSave();
    expect(isConfirmDialogOpen()).toBe(true);

    const dialog = getConfirmDialog()!;
    const confirmBtn = dialog.querySelector(
      '.ot-confirm-dialog__confirm',
    ) as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();
    await act(async () => {
      fireEvent.click(confirmBtn!);
    });

    expect(bridge.update).toHaveBeenCalledTimes(1);
    const [req] = bridge.update.mock.calls[0]!;
    expect(req).toMatchObject({ id: RECORD.id });
    expect(req.changes.openingBalance).toBe(1331.85);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('skips the ConfirmDialog when usage_count === 0 and calls the IPC directly', async () => {
    const { bridge, onSaved, onClose } = await renderEdit(0);
    changeOpeningBalanceInput('999');
    await act(async () => {
      clickSave();
    });

    // ConfirmDialog stays closed — IPC fires immediately.
    expect(isConfirmDialogOpen()).toBe(false);
    expect(bridge.update).toHaveBeenCalledTimes(1);
    const [req] = bridge.update.mock.calls[0]!;
    expect(req.changes.openingBalance).toBe(999);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not prompt or send openingBalance when the user leaves the field unchanged', async () => {
    const { bridge, onSaved, onClose } = await renderEdit(7);
    // Pre-filled value === record.openingBalance, no edit performed.
    await act(async () => {
      clickSave();
    });

    expect(isConfirmDialogOpen()).toBe(false);
    expect(bridge.update).toHaveBeenCalledTimes(1);
    const [req] = bridge.update.mock.calls[0]!;
    // openingBalance must NOT be in the patch — the modal prunes it when
    // it equals the current value (handler would also no-op-strip, but
    // pruning here keeps the wire payload minimal).
    expect('openingBalance' in req.changes).toBe(false);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// trial.3.13 follow-up — Pedro hit this trying to fix his PayPal account's
// opening balance: typing `1331,85` (ES comma-decimal) failed because the
// input was `type="number"` and parsing went through `Number()`. The input
// is now `type="text"` + parseLocaleAmount (same pattern as PR #346's
// BalanceAdjustmentModal fix), so both `,` and `.` decimals work.
describe('AddAccountModal — comma-decimal input (ES locale)', () => {
  it('parses `1331,85` (comma decimal) and sends 1331.85 to the IPC', async () => {
    const { bridge, onSaved, onClose } = await renderEdit(7);
    changeOpeningBalanceInput('1331,85');
    clickSave();
    expect(isConfirmDialogOpen()).toBe(true);

    // Body should show the dialog with delta computed from 1331.85.
    const dialog = getConfirmDialog()!;
    expect(dialog.textContent).toContain('1,331.85');

    const confirmBtn = dialog.querySelector(
      '.ot-confirm-dialog__confirm',
    ) as HTMLButtonElement | null;
    await act(async () => {
      fireEvent.click(confirmBtn!);
    });

    expect(bridge.update).toHaveBeenCalledTimes(1);
    const [req] = bridge.update.mock.calls[0]!;
    expect(req.changes.openingBalance).toBe(1331.85);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('parses `1.331,85` (ES thousands + decimal) and sends 1331.85 to the IPC', async () => {
    const { bridge, onSaved, onClose } = await renderEdit(7);
    changeOpeningBalanceInput('1.331,85');
    clickSave();
    expect(isConfirmDialogOpen()).toBe(true);

    const dialog = getConfirmDialog()!;
    expect(dialog.textContent).toContain('1,331.85');

    const confirmBtn = dialog.querySelector(
      '.ot-confirm-dialog__confirm',
    ) as HTMLButtonElement | null;
    await act(async () => {
      fireEvent.click(confirmBtn!);
    });

    expect(bridge.update).toHaveBeenCalledTimes(1);
    const [req] = bridge.update.mock.calls[0]!;
    expect(req.changes.openingBalance).toBe(1331.85);
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the input as type="text" with inputMode="decimal"', async () => {
    await renderEdit(0);
    const input = getOpeningInput();
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });
});
