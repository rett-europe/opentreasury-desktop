// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateRangePicker, DateRangePill } from './DateRangePicker.js';
import type { Preset } from './DateRangePicker.js';

const PRESETS: readonly Preset[] = [
  {
    id: 'this-month',
    label: 'This month',
    range: () => ({ from: new Date('2026-04-01'), to: new Date('2026-04-30') }),
  },
  {
    id: 'ytd',
    label: 'YTD',
    range: () => ({ from: new Date('2026-01-01'), to: new Date('2026-04-19') }),
  },
];

const LABELS = { from: 'From', to: 'To', apply: 'Apply', invalidRange: 'Invalid range' };

describe('DateRangePicker', () => {
  it('renders presets as a radio group', () => {
    render(
      <DateRangePicker value={null} onChange={vi.fn()} presets={PRESETS} customLabels={LABELS} />,
    );
    expect(screen.getByRole('radiogroup')).toBeDefined();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('fires onChange with the preset range when clicked', () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker value={null} onChange={onChange} presets={PRESETS} customLabels={LABELS} />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'This month' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0] as { from: Date; to: Date };
    expect(arg.from.toISOString().slice(0, 10)).toBe('2026-04-01');
  });

  it('disables Apply when custom from > to', () => {
    render(
      <DateRangePicker value={null} onChange={vi.fn()} presets={PRESETS} customLabels={LABELS} />,
    );
    const fromEl = screen.getByLabelText('From') as HTMLInputElement;
    const toEl = screen.getByLabelText('To') as HTMLInputElement;
    fireEvent.change(fromEl, { target: { value: '04/10/2026' } });
    fireEvent.change(toEl, { target: { value: '04/01/2026' } });
    const applyBtn = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Invalid range');
  });

  it('syncs the visible inputs when the value prop changes externally', () => {
    const { rerender } = render(
      <DateRangePicker
        value={{ from: new Date('2026-04-01T00:00:00Z'), to: new Date('2026-04-30T00:00:00Z') }}
        onChange={vi.fn()}
        presets={PRESETS}
        customLabels={LABELS}
      />,
    );
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('04/01/2026');
    rerender(
      <DateRangePicker
        value={{ from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-03-31T00:00:00Z') }}
        onChange={vi.fn()}
        presets={PRESETS}
        customLabels={LABELS}
      />,
    );
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('01/01/2026');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('03/31/2026');
  });

  it('emits the entered custom range (via the preference-formatted DateInput) on Apply', () => {
    // Issue #353 — the custom inputs are the custom DateInput, so they accept and
    // display the configured numeric format (en default → MM/DD/YYYY) rather than
    // the native control's OS-locale text. A valid range enables Apply and emits
    // real Date bounds.
    const onChange = vi.fn();
    render(
      <DateRangePicker value={null} onChange={onChange} presets={PRESETS} customLabels={LABELS} />,
    );
    const fromEl = screen.getByLabelText('From') as HTMLInputElement;
    const toEl = screen.getByLabelText('To') as HTMLInputElement;
    fireEvent.change(fromEl, { target: { value: '04/10/2026' } });
    fireEvent.change(toEl, { target: { value: '04/20/2026' } });
    expect(fromEl.value).toBe('04/10/2026');
    expect(toEl.value).toBe('04/20/2026');
    const applyBtn = screen.getByRole('button', { name: 'Apply' }) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(false);
    fireEvent.click(applyBtn);
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = onChange.mock.calls[0]?.[0] as { from: Date; to: Date };
    expect(arg.from.toISOString().slice(0, 10)).toBe('2026-04-10');
    expect(arg.to.toISOString().slice(0, 10)).toBe('2026-04-20');
  });
});

describe('DateRangePicker — popover variant', () => {
  // Regression guard for #356: the Movements filter bar uses
  // customRangeLayout="popover" so the From/To/Apply controls live in an
  // anchored dialog and never inflate the bar height. The inline variant above
  // stays the default and is unaffected.
  function renderPopover(onChange = vi.fn()) {
    return render(
      <DateRangePicker
        value={null}
        onChange={onChange}
        presets={PRESETS}
        customLabels={LABELS}
        customRangeLayout="popover"
        customTriggerLabel="Custom"
      />,
    );
  }

  it('keeps the custom From/To collapsed until the trigger is opened', () => {
    renderPopover();
    // Presets still render inline.
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    // The custom fields are not in the DOM until the popover opens.
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Custom' });
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the dialog, focuses the From field, and wires aria-controls', () => {
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Custom' });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.getAttribute('id'));
    expect(document.activeElement).toBe(screen.getByLabelText('From'));
  });

  it('Escape closes the dialog and returns focus to the trigger', () => {
    renderPopover();
    const trigger = screen.getByRole('button', { name: 'Custom' });
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('Apply emits the range and closes the dialog', () => {
    const onChange = vi.fn();
    renderPopover(onChange);
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '04/10/2026' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '04/20/2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('DateRangePill', () => {
  it('renders label and fires onClear', () => {
    const onClear = vi.fn();
    render(<DateRangePill label="April 2026" onClear={onClear} clearLabel="Clear range" />);
    expect(screen.getByText('April 2026')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Clear range' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
