import { formatCurrency } from '../../utils/numberFormat.js';
import './DonutChart.css';

export type DonutChartSlice = {
  readonly label: string;
  readonly value: number;
  readonly categoryId: string; // for deterministic coloring
};

export type DonutChartProps = {
  readonly slices: ReadonlyArray<DonutChartSlice>;
  readonly total: number;
  readonly size?: number;
  readonly thickness?: number;
  readonly centerLabel?: string;
  readonly emptyLabel?: string;
  readonly ariaLabel: string;
  readonly locale: string;
  readonly currency?: string;
};

const DEFAULT_SIZE = 120;
const DEFAULT_THICKNESS = 22;
const MAX_SLICES = 5;

/**
 * Pure SVG donut chart for category distribution visualization.
 * Automatically aggregates tail categories into "Otras" bucket when >5 slices.
 * Uses deterministic color hashing for stable, reproducible colors.
 */
export function DonutChart({
  slices,
  total,
  size = DEFAULT_SIZE,
  thickness = DEFAULT_THICKNESS,
  centerLabel = 'TOTAL',
  emptyLabel = 'Sin datos',
  ariaLabel,
  locale,
  currency = 'EUR',
}: DonutChartProps) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Empty state
  if (slices.length === 0 || total === 0) {
    return (
      <div className="ot-donut-chart ot-donut-chart--empty" role="img" aria-label={ariaLabel}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--color-border-subtle)"
            strokeWidth={thickness}
          />
        </svg>
        <div className="ot-donut-chart__empty-text" aria-hidden="true">
          {emptyLabel}
        </div>
      </div>
    );
  }

  // Aggregate tail if >MAX_SLICES
  let processedSlices = [...slices];
  let othersBucket: DonutChartSlice | null = null;

  if (slices.length > MAX_SLICES) {
    const topSlices = slices.slice(0, MAX_SLICES);
    const tailSlices = slices.slice(MAX_SLICES);
    const othersValue = tailSlices.reduce((sum, s) => sum + s.value, 0);

    othersBucket = {
      label: `Otras (${tailSlices.length})`,
      value: othersValue,
      categoryId: '__otras__',
    };

    processedSlices = [...topSlices, othersBucket];
  }

  // Calculate segments. Each segment is rendered as its own stroked <circle>
  // rotated to its start angle, with a one-shot strokeDasharray of "L gap".
  // We rotate per-segment instead of using strokeDashoffset to position
  // slices, which avoids the classic "Pac-Man" bug: when a segment's dash
  // begins at a non-zero path offset, the trailing portion of the dash can
  // overrun the path's end (no wrap across the closing point of an SVG
  // <circle>) and a wedge-shaped gap appears for any slice >= ~75% of the
  // circumference. Rotating the circle so the dash always starts at path
  // position 0 keeps the entire dash in-bounds for every fraction in [0, 1].
  let currentAngle = -90; // degrees; -90 = 12 o'clock
  const segments = processedSlices.map((slice) => {
    const fraction = total > 0 ? slice.value / total : 0;
    const dashLength = fraction * circumference;
    const startAngle = currentAngle;
    currentAngle += fraction * 360;
    return {
      slice,
      dashLength,
      startAngle,
      percentage: fraction * 100,
    };
  });

  return (
    <div className="ot-donut-chart" role="img" aria-label={ariaLabel}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, idx) => {
          const stroke =
            seg.slice.categoryId === '__otras__'
              ? 'var(--color-donut-otras)'
              : `var(--color-donut-${idx % 8})`;

          // A segment that covers the full circle (only slice, percentage at
          // 100% within float tolerance) is rendered as a plain stroked ring
          // with no dasharray — keeps the SVG simple and avoids any seam.
          if (segments.length === 1 && seg.percentage >= 99.999) {
            return (
              <circle
                key={seg.slice.categoryId}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={stroke}
                strokeWidth={thickness}
                className="ot-donut-chart__segment"
              >
                <title>{`${seg.slice.label}: ${formatCurrency(seg.slice.value, locale, currency)} (${seg.percentage.toFixed(1)}%)`}</title>
              </circle>
            );
          }

          return (
            <circle
              key={seg.slice.categoryId}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={stroke}
              strokeWidth={thickness}
              strokeDasharray={`${seg.dashLength} ${circumference}`}
              transform={`rotate(${seg.startAngle} ${center} ${center})`}
              className="ot-donut-chart__segment"
            >
              <title>{`${seg.slice.label}: ${formatCurrency(seg.slice.value, locale, currency)} (${seg.percentage.toFixed(1)}%)`}</title>
            </circle>
          );
        })}

        {/* Center label */}
        <text
          x={center}
          y={center - 8}
          className="ot-donut-chart__center-label"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {centerLabel}
        </text>
        <text
          x={center}
          y={center + 10}
          className="ot-donut-chart__center-value"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          {formatCurrency(total, locale, currency)}
        </text>
      </svg>

      {/* Hidden data table for accessibility */}
      <table className="ot-donut-chart__data-table">
        <caption>Distribución por categoría</caption>
        <thead>
          <tr>
            <th>Categoría</th>
            <th>Valor</th>
            <th>Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          {segments.map((seg) => (
            <tr key={seg.slice.categoryId}>
              <td>{seg.slice.label}</td>
              <td>{formatCurrency(seg.slice.value, locale, currency)}</td>
              <td>{seg.percentage.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
