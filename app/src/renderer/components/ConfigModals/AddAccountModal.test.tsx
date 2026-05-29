// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { AddAccountModal } from './AddAccountModal.js';

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

// Regression — the opening-balance input must reject garbage keystrokes the
// same way the transaction-form amount inputs do. This guard pairs with the
// `parseLocaleAmount` conversion handled in the sibling comma-decimal PR
// (#345); applied here so the protection is in place regardless of merge order.
describe('AddAccountModal — opening-balance keystroke sanitization', () => {
  it('silently rejects garbage keystrokes in the opening-balance input', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <AddAccountModal isOpen={true} onClose={vi.fn()} onSaved={vi.fn()} />
      </I18nextProvider>,
    );

    const input = document.getElementById('acc-opening') as HTMLInputElement;
    expect(input).not.toBeNull();

    fireEvent.change(input, { target: { value: '1331,85' } });
    expect(input.value).toBe('1331,85');

    fireEvent.change(input, { target: { value: '1.....,2,..' } });
    expect(input.value).toBe('1331,85');
    fireEvent.change(input, { target: { value: '1..2' } });
    expect(input.value).toBe('1331,85');
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input.value).toBe('1331,85');
  });
});
