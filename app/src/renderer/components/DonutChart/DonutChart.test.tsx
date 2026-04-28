// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DonutChart, type DonutChartSlice } from './DonutChart.js';

const LOCALE = 'es-ES';
const CURRENCY = 'EUR';

describe('DonutChart', () => {
  const createSlice = (label: string, value: number, categoryId: string): DonutChartSlice => ({
    label,
    value,
    categoryId,
  });

  it('renders empty state when no slices', () => {
    render(
      <DonutChart
        slices={[]}
        total={0}
        ariaLabel="Empty chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    expect(screen.getByRole('img', { name: 'Empty chart' })).toBeDefined();
    expect(screen.getByText('Sin datos')).toBeDefined();
  });

  it('renders custom empty label', () => {
    render(
      <DonutChart
        slices={[]}
        total={0}
        emptyLabel="No hay datos"
        ariaLabel="Empty chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    expect(screen.getByText('No hay datos')).toBeDefined();
  });

  it('renders single segment', () => {
    const slices = [createSlice('Donations', 1000, 'cat-1')];

    render(
      <DonutChart
        slices={slices}
        total={1000}
        ariaLabel="Single segment chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    expect(screen.getByRole('img', { name: 'Single segment chart' })).toBeDefined();
    // Center should show total
    const centerValues = screen.getAllByText('1.000,00 €');
    expect(centerValues.length).toBeGreaterThan(0);
  });

  it('renders a single 100% slice as a full ring (no Pac-Man gap)', () => {
    // Regression: when one slice covers the entire circle, using
    // strokeDasharray + strokeDashoffset together clips ~1/4 of the ring.
    // Verify the full-ring code path: a plain stroked circle with no
    // strokeDasharray attribute.
    const slices = [createSlice('Only', 500, 'cat-only')];

    const { container } = render(
      <DonutChart
        slices={slices}
        total={500}
        ariaLabel="Full ring chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    const segments = container.querySelectorAll('circle.ot-donut-chart__segment');
    expect(segments).toHaveLength(1);
    const seg = segments[0]!;
    // No dasharray means no chance of the rotation offset clipping the ring.
    expect(seg.getAttribute('stroke-dasharray')).toBeNull();
    expect(seg.getAttribute('stroke-dashoffset')).toBeNull();
  });

  it('renders multiple segments', () => {
    const slices = [
      createSlice('Donations', 1000, 'cat-1'),
      createSlice('Events', 500, 'cat-2'),
      createSlice('Grants', 300, 'cat-3'),
    ];

    render(
      <DonutChart
        slices={slices}
        total={1800}
        ariaLabel="Multi segment chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    // Should render 3 segments
    const svg = screen.getByRole('img').querySelector('svg');
    const circles = svg?.querySelectorAll('circle.ot-donut-chart__segment');
    expect(circles).toHaveLength(3);
  });

  it('aggregates tail into "Otras" bucket when >5 slices', () => {
    const slices = [
      createSlice('Cat 1', 1000, 'cat-1'),
      createSlice('Cat 2', 900, 'cat-2'),
      createSlice('Cat 3', 800, 'cat-3'),
      createSlice('Cat 4', 700, 'cat-4'),
      createSlice('Cat 5', 600, 'cat-5'),
      createSlice('Cat 6', 100, 'cat-6'),
      createSlice('Cat 7', 90, 'cat-7'),
      createSlice('Cat 8', 80, 'cat-8'),
    ];

    render(
      <DonutChart
        slices={slices}
        total={4270}
        ariaLabel="Chart with otras"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    // Should render exactly 6 segments (top 5 + Otras)
    const svg = screen.getByRole('img').querySelector('svg');
    const circles = svg?.querySelectorAll('circle.ot-donut-chart__segment');
    expect(circles).toHaveLength(6);

    // Data table should show "Otras (3)"
    const table = screen.getByRole('table', { hidden: true });
    expect(table.textContent).toContain('Otras (3)');
  });

  it('renders custom center label', () => {
    const slices = [createSlice('Test', 500, 'cat-1')];

    render(
      <DonutChart
        slices={slices}
        total={500}
        centerLabel="INGRESOS"
        ariaLabel="Custom label chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    expect(screen.getByText('INGRESOS')).toBeDefined();
  });

  it('includes accessibility data table', () => {
    const slices = [createSlice('Donations', 1000, 'cat-1'), createSlice('Events', 500, 'cat-2')];

    render(
      <DonutChart
        slices={slices}
        total={1500}
        ariaLabel="Chart with data table"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    const table = screen.getByRole('table', { hidden: true });
    expect(table).toBeDefined();
    expect(table.textContent).toContain('Donations');
    expect(table.textContent).toContain('Events');
    // Formatted values are in the table
    expect(table.textContent).toMatch(/1\.000,00/);
    expect(table.textContent).toMatch(/500,00/);
  });

  it('respects custom size', () => {
    const slices = [createSlice('Test', 100, 'cat-1')];

    const { container } = render(
      <DonutChart
        slices={slices}
        total={100}
        size={200}
        ariaLabel="Custom size"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('200');
    expect(svg?.getAttribute('height')).toBe('200');
  });

  it('rotates each multi-segment slice instead of using strokeDashoffset (Pac-Man regression)', () => {
    // Regression: when one slice was 75%+ of the circle and rendered with
    // strokeDashoffset = -C/4, the trailing portion of the dash overran the
    // path's end and a wedge-shaped gap appeared. Each multi-segment slice
    // must now be rotated to its start angle and use no dashoffset, so the
    // dash always fits entirely within path positions [0, L].
    const slices = [
      createSlice('Casa', 9500, 'cat-house'),
      createSlice('Comida', 300, 'cat-food'),
      createSlice('Otros', 200, 'cat-other'),
    ];

    const { container } = render(
      <DonutChart
        slices={slices}
        total={10000}
        ariaLabel="Skewed chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    const segments = container.querySelectorAll('circle.ot-donut-chart__segment');
    expect(segments).toHaveLength(3);
    segments.forEach((seg) => {
      // No segment uses strokeDashoffset (which caused the wedge bug).
      expect(seg.getAttribute('stroke-dashoffset')).toBeNull();
      // Each segment is rotated to its start angle.
      const transform = seg.getAttribute('transform') ?? '';
      expect(transform).toMatch(/^rotate\(/);
    });

    // First segment must start at -90° (12 o'clock).
    const firstTransform = segments[0]?.getAttribute('transform') ?? '';
    expect(firstTransform).toContain('rotate(-90');
  });

  it('renders a near-100% dominant slice without losing the tail (Pac-Man regression)', () => {
    // Two slices: 99.5% + 0.5%. Both must render with intact dasharrays and
    // unique rotations — no implicit "almost-100%" merge into a single ring.
    const slices = [createSlice('Mega', 9950, 'cat-mega'), createSlice('Tiny', 50, 'cat-tiny')];

    const { container } = render(
      <DonutChart
        slices={slices}
        total={10000}
        ariaLabel="Near-full chart"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    const segments = container.querySelectorAll('circle.ot-donut-chart__segment');
    expect(segments).toHaveLength(2);
    // Both segments carry a strokeDasharray (i.e., the full-ring shortcut did
    // not eat the tail).
    segments.forEach((seg) => {
      expect(seg.getAttribute('stroke-dasharray')).not.toBeNull();
    });
  });

  it('uses deterministic colors via CSS custom properties', () => {
    const slices = [createSlice('Cat A', 100, 'cat-a'), createSlice('Cat B', 200, 'cat-b')];

    const { container } = render(
      <DonutChart
        slices={slices}
        total={300}
        ariaLabel="Color test"
        locale={LOCALE}
        currency={CURRENCY}
      />,
    );

    const segments = container.querySelectorAll('circle.ot-donut-chart__segment');

    // First segment should use --color-donut-0
    const firstStroke = segments[0]?.getAttribute('stroke');
    expect(firstStroke).toContain('--color-donut-');

    // Should use palette indices 0-7
    segments.forEach((seg) => {
      const stroke = seg.getAttribute('stroke');
      expect(stroke).toMatch(/--color-donut-[0-7]|--color-donut-otras/);
    });
  });
});
