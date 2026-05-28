// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { ConfirmDialog } from './ConfirmDialog.js';

// jsdom doesn't implement HTMLDialogElement.showModal/close — stub so the
// component doesn't throw when it tries to open. Mirrors the pattern used
// by every other modal test in this repo.
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

function renderConfirm(props?: Partial<React.ComponentProps<typeof ConfirmDialog>>): {
  onConfirm: ReturnType<typeof vi.fn>;
  onCancel: ReturnType<typeof vi.fn>;
  result: ReturnType<typeof render>;
} {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <I18nextProvider i18n={i18n}>
      <ConfirmDialog
        isOpen={true}
        title="Delete note"
        message="Are you sure?"
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={onConfirm}
        onCancel={onCancel}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onConfirm, onCancel, result };
}

describe('ConfirmDialog', () => {
  it('renders the title and message when open', () => {
    renderConfirm();
    expect(screen.getByText('Delete note')).toBeTruthy();
    expect(screen.getByText('Are you sure?')).toBeTruthy();
    // role="alertdialog" — this is a confirm, not a generic dialog.
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('renders custom confirm + cancel labels', () => {
    renderConfirm({ confirmLabel: 'Discard', cancelLabel: 'Stay' });
    expect(screen.getByRole('button', { name: 'Discard' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeTruthy();
  });

  it('falls back to common.cancel / common.save when no labels passed', () => {
    renderConfirm({ confirmLabel: undefined, cancelLabel: undefined, variant: 'default' });
    // i18n resolves to "Cancel" + "Save" in en.
    expect(screen.getByRole('button', { name: /Cancel|Cancelar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save|Guardar/ })).toBeTruthy();
  });

  it('renders the destructive variant with the danger button class', () => {
    renderConfirm({ variant: 'destructive', confirmLabel: 'Delete' });
    const confirmBtn = screen.getByRole('button', { name: 'Delete' });
    expect(confirmBtn.className).toContain('ot-button--destructive');
  });

  it('renders the default variant with the primary button class', () => {
    renderConfirm({ variant: 'default', confirmLabel: 'OK' });
    const confirmBtn = screen.getByRole('button', { name: 'OK' });
    expect(confirmBtn.className).toContain('ot-button--primary');
  });

  it('fires onConfirm when the confirm button is clicked', () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const { onConfirm, onCancel } = renderConfirm();
    fireEvent.click(screen.getByRole('button', { name: /Cancel|Cancelar/ }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onCancel when the dialog emits the native cancel event (Escape)', () => {
    const { onCancel, onConfirm } = renderConfirm();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    // Simulate the browser's `cancel` event (fired on Escape).
    const evt = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(evt);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    // The component should have preventDefault'd so the dialog isn't
    // auto-closed by the browser (we control close via the isOpen prop).
    expect(evt.defaultPrevented).toBe(true);
  });

  it('fires onCancel when the backdrop is clicked (click target === dialog)', () => {
    const { onCancel } = renderConfirm();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    // A backdrop click in browsers fires a click event whose `target` is
    // the dialog element itself (rather than any inner content).
    fireEvent.click(dialog);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onCancel for clicks inside the content', () => {
    const { onCancel } = renderConfirm();
    fireEvent.click(screen.getByText('Are you sure?'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('closes the dialog on unmount (top-layer safety from useCloseDialogOnUnmount)', () => {
    const { result } = renderConfirm();
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    result.unmount();
    // The cleanup hook should have called dialog.close(), removing the
    // `open` attribute (stubbed in beforeEach to do exactly that).
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('does not render its content when isOpen=false (dialog stays closed)', () => {
    renderConfirm({ isOpen: false });
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).not.toBeNull();
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
