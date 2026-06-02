// @vitest-environment jsdom
// Issue #353 — Tests for the custom DateInput (ISO value model, configured display).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { DateInput } from './DateInput.js';
import { FormatPreferencesProvider, DATE_FORMAT_STORAGE_KEY } from '../../format/index.js';

function renderWithFormat(ui: ReactElement, dateFormat?: 'DMY' | 'MDY' | 'ISO') {
  if (dateFormat) localStorage.setItem(DATE_FORMAT_STORAGE_KEY, dateFormat);
  return render(<FormatPreferencesProvider>{ui}</FormatPreferencesProvider>);
}

function input(): HTMLInputElement {
  return document.querySelector('input[data-ot-dateinput]') as HTMLInputElement;
}

describe('DateInput', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the ISO value in the configured display format', () => {
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />, 'DMY');
    expect(input().value).toBe('21/04/2026');
  });

  it('renders MDY by default (en fallback) and ISO when configured', () => {
    const { unmount } = renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />);
    expect(input().value).toBe('04/21/2026');
    unmount();
    localStorage.clear();
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />, 'ISO');
    expect(input().value).toBe('2026-04-21');
  });

  it('emits a valid ISO string when a complete date is typed', () => {
    const onChange = vi.fn();
    renderWithFormat(<DateInput value="" onChange={onChange} />, 'DMY');
    fireEvent.change(input(), { target: { value: '21/04/2026' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-04-21');
  });

  it('does NOT emit while the typed date is incomplete/invalid', () => {
    const onChange = vi.fn();
    renderWithFormat(<DateInput value="" onChange={onChange} />, 'DMY');
    fireEvent.change(input(), { target: { value: '21/04' } });
    // Only the (no-op) intermediate states — never a garbage ISO value.
    expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/\d{4}-\d{2}-\d{2}/));
  });

  it('emits empty string when cleared', () => {
    const onChange = vi.fn();
    renderWithFormat(<DateInput value="2026-04-21" onChange={onChange} />, 'DMY');
    fireEvent.change(input(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('reverts un-parseable text on blur to the last valid value', () => {
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />, 'DMY');
    fireEvent.change(input(), { target: { value: '99/99' } });
    fireEvent.blur(input());
    expect(input().value).toBe('21/04/2026');
  });

  it('marks aria-invalid while the text cannot be parsed', () => {
    renderWithFormat(<DateInput value="" onChange={() => {}} />, 'DMY');
    fireEvent.change(input(), { target: { value: '31/02/2026' } }); // impossible date
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('does not emit values outside min/max bounds', () => {
    const onChange = vi.fn();
    renderWithFormat(
      <DateInput value="" onChange={onChange} min="2026-01-01" max="2026-12-31" />,
      'DMY',
    );
    fireEvent.change(input(), { target: { value: '01/01/2030' } }); // after max
    expect(onChange).not.toHaveBeenCalledWith('2030-01-01');
  });
});
