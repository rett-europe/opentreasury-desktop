// @vitest-environment jsdom
// Issue #353 — Tests for the custom DateInput (ISO value model, configured display).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, within } from '@testing-library/react';
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

function trigger(): HTMLButtonElement | null {
  return document.querySelector('button[aria-haspopup="dialog"]');
}

function dialog(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function grid(): HTMLElement {
  return document.querySelector('[role="grid"]') as HTMLElement;
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

  // ── Calendar popover (Issue #399) ─────────────────────────────────────────

  it('opens the calendar popover from the trigger button', () => {
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />, 'DMY');
    expect(dialog()).toBeNull();
    fireEvent.click(trigger()!);
    expect(dialog()).not.toBeNull();
  });

  it('selecting a day emits that day ISO and closes the popover', () => {
    const onChange = vi.fn();
    renderWithFormat(<DateInput value="2026-04-21" onChange={onChange} />, 'DMY');
    fireEvent.click(trigger()!);
    const day10 = within(dialog()!).getByRole('gridcell', { name: '10' });
    fireEvent.click(day10);
    expect(onChange).toHaveBeenLastCalledWith('2026-04-10');
    expect(dialog()).toBeNull();
  });

  it('disables days outside the inclusive min/max bounds', () => {
    renderWithFormat(
      <DateInput value="2026-04-15" onChange={() => {}} min="2026-04-10" max="2026-04-20" />,
      'DMY',
    );
    fireEvent.click(trigger()!);
    const d = dialog()!;
    expect((within(d).getByRole('gridcell', { name: '5' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((within(d).getByRole('gridcell', { name: '25' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((within(d).getByRole('gridcell', { name: '15' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('does not emit when an out-of-range day is clicked', () => {
    const onChange = vi.fn();
    renderWithFormat(
      <DateInput value="2026-04-15" onChange={onChange} min="2026-04-10" max="2026-04-20" />,
      'DMY',
    );
    fireEvent.click(trigger()!);
    fireEvent.click(within(dialog()!).getByRole('gridcell', { name: '5' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });

  it('hides/inerts the trigger when disabled', () => {
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} disabled />, 'DMY');
    expect(trigger()).toBeNull();
    expect(input().disabled).toBe(true);
  });

  it('closes the popover on Escape and returns focus to the trigger', () => {
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />, 'DMY');
    fireEvent.click(trigger()!);
    expect(dialog()).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('closes the popover on outside click', () => {
    renderWithFormat(<DateInput value="2026-04-21" onChange={() => {}} />, 'DMY');
    fireEvent.click(trigger()!);
    expect(dialog()).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(dialog()).toBeNull();
  });

  it('navigates with arrow keys and selects with Enter', () => {
    const onChange = vi.fn();
    renderWithFormat(<DateInput value="2026-04-15" onChange={onChange} />, 'DMY');
    fireEvent.click(trigger()!);
    fireEvent.keyDown(grid(), { key: 'ArrowRight' }); // 15 → 16
    fireEvent.keyDown(grid(), { key: 'ArrowDown' }); // 16 → 23
    fireEvent.keyDown(grid(), { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('2026-04-23');
    expect(dialog()).toBeNull();
  });

  it('still emits a valid ISO when typing while the trigger is present', () => {
    const onChange = vi.fn();
    renderWithFormat(<DateInput value="" onChange={onChange} />, 'DMY');
    expect(trigger()).not.toBeNull();
    fireEvent.change(input(), { target: { value: '21/04/2026' } });
    expect(onChange).toHaveBeenLastCalledWith('2026-04-21');
  });
});
