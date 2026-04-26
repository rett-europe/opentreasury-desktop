// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { GroupedBarChart } from './GroupedBarChart.js';

const monthLabels = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function buildSeries(valueFn: (i: number) => [number, number] = (i) => [i * 100, i * 80]) {
  return monthLabels.map((label, i) => ({ label, values: valueFn(i) as [number, number] }));
}

describe('GroupedBarChart', () => {
  it('renders 12 month-groups when given 12 series entries', () => {
    render(
      <GroupedBarChart
        series={buildSeries()}
        legend={['2026', '2025']}
        locale="es-ES"
        ariaLabel="Chart"
        dataTableCaption="Datos mensuales"
      />,
    );
    const groups = screen.getAllByTestId(/^gbc-group-/);
    expect(groups).toHaveLength(12);
  });

  it('a11y data table has one row per month plus header row and 2 data columns', () => {
    render(
      <GroupedBarChart
        series={buildSeries()}
        legend={['2026', '2025']}
        locale="es-ES"
        ariaLabel="Chart"
        dataTableCaption="Datos mensuales"
      />,
    );
    const table = screen.getByRole('table', { hidden: true });
    expect(within(table).getByText('Datos mensuales')).toBeDefined();
    // 12 data rows + 1 header row
    const rows = within(table).getAllByRole('row', { hidden: true });
    expect(rows).toHaveLength(13);
    // header: row label + 2 data columns
    const headerCells = within(rows[0]!).getAllByRole('columnheader', { hidden: true });
    expect(headerCells).toHaveLength(3);
  });

  it('data table cells contain locale-formatted currency for both series', () => {
    render(
      <GroupedBarChart
        series={[
          { label: 'Ene', values: [1000, 500] },
          { label: 'Feb', values: [2000, 1500] },
        ]}
        legend={['2026', '2025']}
        locale="en-US"
        currency="EUR"
        ariaLabel="Chart"
        dataTableCaption="Monthly data"
      />,
    );
    const table = screen.getByRole('table', { hidden: true });
    // en-US EUR formatting → "€1,000.00"
    expect(within(table).getByText('€1,000.00')).toBeDefined();
    expect(within(table).getByText('€500.00')).toBeDefined();
    expect(within(table).getByText('€2,000.00')).toBeDefined();
    expect(within(table).getByText('€1,500.00')).toBeDefined();
  });

  it('shows tooltip with formatted currency for both series on focus', () => {
    render(
      <GroupedBarChart
        series={buildSeries(() => [1000, 800])}
        legend={['2026', '2025']}
        locale="en-US"
        ariaLabel="Chart"
        dataTableCaption="Data"
      />,
    );
    const first = screen.getByTestId('gbc-group-0');
    fireEvent.focus(first);
    const tooltip = screen.getByTestId('gbc-tooltip');
    expect(within(tooltip).getByText(/€1,000\.00/)).toBeDefined();
    expect(within(tooltip).getByText(/€800\.00/)).toBeDefined();
    // delta = +25% (rounded to integer per Pedro feedback on PR #91)
    expect(within(tooltip).getByText(/\+25%/)).toBeDefined();
  });

  it('renders empty state when all values are 0', () => {
    render(
      <GroupedBarChart
        series={buildSeries(() => [0, 0])}
        legend={['2026', '2025']}
        locale="es-ES"
        ariaLabel="Chart"
        dataTableCaption="Datos mensuales"
        emptyLabel="Sin datos"
      />,
    );
    expect(screen.getByText('Sin datos')).toBeDefined();
    // no bar groups rendered when empty
    expect(screen.queryAllByTestId(/^gbc-group-/)).toHaveLength(0);
  });

  it('ArrowRight advances focus through groups; ArrowLeft retreats', () => {
    render(
      <GroupedBarChart
        series={buildSeries()}
        legend={['2026', '2025']}
        locale="es-ES"
        ariaLabel="Chart"
        dataTableCaption="Datos"
      />,
    );
    const first = screen.getByTestId('gbc-group-0');
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    const second = screen.getByTestId('gbc-group-1');
    expect(document.activeElement).toBe(second);
    fireEvent.keyDown(second, { key: 'ArrowRight' });
    const third = screen.getByTestId('gbc-group-2');
    expect(document.activeElement).toBe(third);
    fireEvent.keyDown(third, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(second);
  });

  it('Home/End keys jump to first/last group', () => {
    render(
      <GroupedBarChart
        series={buildSeries()}
        legend={['2026', '2025']}
        locale="es-ES"
        ariaLabel="Chart"
        dataTableCaption="Datos"
      />,
    );
    const first = screen.getByTestId('gbc-group-0');
    first.focus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('gbc-group-11'));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(first);
  });

  it('each group has accessible aria-label describing both series and label', () => {
    render(
      <GroupedBarChart
        series={[{ label: 'Ene', values: [1000, 800] }]}
        legend={['2026', '2025']}
        locale="en-US"
        ariaLabel="Chart"
        dataTableCaption="Data"
      />,
    );
    const group = screen.getByTestId('gbc-group-0');
    const label = group.getAttribute('aria-label') ?? '';
    expect(label).toContain('Ene');
    expect(label).toContain('2026');
    expect(label).toContain('2025');
    expect(label).toMatch(/€1,000\.00/);
    expect(label).toMatch(/€800\.00/);
    expect(label).toMatch(/\+25%/);
  });
});
