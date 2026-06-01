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
    fireEvent.change(fromEl, { target: { value: '2026-04-10' } });
    fireEvent.change(toEl, { target: { value: '2026-04-01' } });
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
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-04-01');
    rerender(
      <DateRangePicker
        value={{ from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-03-31T00:00:00Z') }}
        onChange={vi.fn()}
        presets={PRESETS}
        customLabels={LABELS}
      />,
    );
    expect((screen.getByLabelText('From') as HTMLInputElement).value).toBe('2026-01-01');
    expect((screen.getByLabelText('To') as HTMLInputElement).value).toBe('2026-03-31');
  });

  it('applies native min/max constraints derived from the entered range', () => {
    render(
      <DateRangePicker value={null} onChange={vi.fn()} presets={PRESETS} customLabels={LABELS} />,
    );
    const fromEl = screen.getByLabelText('From') as HTMLInputElement;
    const toEl = screen.getByLabelText('To') as HTMLInputElement;
    fireEvent.change(fromEl, { target: { value: '2026-04-10' } });
    fireEvent.change(toEl, { target: { value: '2026-04-20' } });
    expect(toEl.getAttribute('min')).toBe('2026-04-10');
    expect(fromEl.getAttribute('max')).toBe('2026-04-20');
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
