// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { ConfirmHeaderRow } from './ConfirmHeaderRow.js';

const previewRows: string[][] = [
  ['Extracto', '', '', ''],
  ['Titular: Asoc. Rett', '', '', ''],
  ['', '', '', ''],
  ['Periodo: 01/2026', '', '', ''],
  ['Fecha', 'Concepto', 'Importe', 'Saldo'],
  ['15/01/2026', 'Donación', '150,00', '1.150,00'],
  ['16/01/2026', 'Cuota', '20,00', '1.170,00'],
];

function renderComponent(overrides: Partial<React.ComponentProps<typeof ConfirmHeaderRow>> = {}) {
  const onHeaderRowChange = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ConfirmHeaderRow
        detectedHeaderRow={5}
        headerRow={5}
        previewRows={previewRows}
        onHeaderRowChange={onHeaderRowChange}
        {...overrides}
      />
    </I18nextProvider>,
  );
  return { ...utils, onHeaderRowChange };
}

describe('ConfirmHeaderRow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all preview rows', () => {
    renderComponent();
    for (let i = 1; i <= previewRows.length; i++) {
      expect(screen.getByTestId(`confirm-header-row-${i}`)).toBeTruthy();
    }
  });

  it('highlights the row matching headerRow with the header class', () => {
    renderComponent({ headerRow: 5 });
    const headerEl = screen.getByTestId('confirm-header-row-5');
    expect(headerEl.className).toContain('ot-confirm-header-row__row--header');
    expect(headerEl.getAttribute('aria-current')).toBe('true');

    const skippedEl = screen.getByTestId('confirm-header-row-2');
    expect(skippedEl.className).toContain('ot-confirm-header-row__row--skipped');

    const dataEl = screen.getByTestId('confirm-header-row-6');
    expect(dataEl.className).toContain('ot-confirm-header-row__row--data');
  });

  it('marks empty rows with placeholder text', () => {
    renderComponent();
    // Row 3 in fixture is fully empty
    const emptyRow = screen.getByTestId('confirm-header-row-3');
    expect(emptyRow.textContent).toContain('(empty)');
  });

  it('shows the detected message and label', () => {
    renderComponent({ detectedHeaderRow: 5 });
    expect(screen.getByText(/We detected headers on row 5/)).toBeTruthy();
    expect(screen.getByLabelText(/Header row/i)).toBeTruthy();
  });

  it('calls onHeaderRowChange when user changes the number input', () => {
    const { onHeaderRowChange } = renderComponent({ headerRow: 5 });
    const input = screen.getByLabelText(/Header row/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2' } });
    expect(onHeaderRowChange).toHaveBeenCalledWith(2);
  });

  it('clamps values below the minimum', () => {
    const { onHeaderRowChange } = renderComponent({ headerRow: 5 });
    const input = screen.getByLabelText(/Header row/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0' } });
    expect(onHeaderRowChange).toHaveBeenCalledWith(1);
  });

  it('does not call onHeaderRowChange when value is unchanged', () => {
    const { onHeaderRowChange } = renderComponent({ headerRow: 5 });
    const input = screen.getByLabelText(/Header row/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '5' } });
    expect(onHeaderRowChange).not.toHaveBeenCalled();
  });
});
