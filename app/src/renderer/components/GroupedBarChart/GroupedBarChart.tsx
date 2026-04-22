import { type KeyboardEvent, useRef, useState } from 'react';
import { formatCurrency } from '../../utils/numberFormat.js';
import './GroupedBarChart.css';

export type GroupedBarChartProps = {
  readonly series: ReadonlyArray<{
    readonly label: string;
    readonly values: readonly [number, number];
  }>;
  readonly legend: readonly [string, string];
  readonly currency?: string;
  readonly locale: string;
  readonly ariaLabel: string;
  readonly dataTableCaption: string;
  /** Optional localized "no data" message. Parent should pass `t('...')`. */
  readonly emptyLabel?: string;
};

// SVG viewBox constants — responsive via CSS width: 100%.
const VIEW_W = 600;
// Aspect ratio 600:240 (2.5:1) keeps the chart proportionate with the KPI
// strip and category table on the Saldo screen. Reduced from 340 so the plot
// area does not visually dominate the page layout.
const VIEW_H = 240;
const PAD_L = 32;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 56; // reserve space for x-axis (month) labels
const CHART_W = VIEW_W - PAD_L - PAD_R;
const CHART_H = VIEW_H - PAD_T - PAD_B;
const BAR_GAP = 2;

function computeDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export function GroupedBarChart({
  series,
  legend,
  currency = 'EUR',
  locale,
  ariaLabel,
  dataTableCaption,
  emptyLabel,
}: GroupedBarChartProps): JSX.Element {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const groupRefs = useRef<Array<SVGGElement | null>>([]);

  const format = (n: number): string => formatCurrency(n, locale, currency);

  const isEmpty = series.every((s) => s.values[0] === 0 && s.values[1] === 0);

  // y-scale supports negative nets — domain is [min(0, values), max(0, values)].
  const allValues = series.flatMap((s) => [s.values[0], s.values[1]]);
  const maxVal = Math.max(0, ...allValues);
  const minVal = Math.min(0, ...allValues);
  const range = maxVal - minVal || 1;
  const zeroY = PAD_T + (maxVal / range) * CHART_H;

  const scaleBar = (v: number): { readonly y: number; readonly h: number } => {
    const y = PAD_T + ((maxVal - v) / range) * CHART_H;
    return { y: Math.min(y, zeroY), h: Math.max(0, Math.abs(y - zeroY)) };
  };

  const n = Math.max(1, series.length);
  const groupW = CHART_W / n;
  const barW = Math.max(2, (groupW - BAR_GAP - 6) / 2);

  const moveFocus = (target: number): void => {
    const clamped = Math.max(0, Math.min(series.length - 1, target));
    const el = groupRefs.current[clamped];
    if (el) {
      el.focus();
      setFocusedIndex(clamped);
    }
  };

  const handleKey = (e: KeyboardEvent<SVGGElement>, i: number): void => {
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        moveFocus(i + 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        moveFocus(i - 1);
        break;
      case 'Home':
        e.preventDefault();
        moveFocus(0);
        break;
      case 'End':
        e.preventDefault();
        moveFocus(series.length - 1);
        break;
      default:
        break;
    }
  };

  const tooltipSeries =
    focusedIndex !== null && focusedIndex >= 0 && focusedIndex < series.length
      ? series[focusedIndex]
      : undefined;

  return (
    <div className="ot-grouped-bar-chart">
      <div className="ot-grouped-bar-chart__legend" aria-hidden="true">
        <span className="ot-grouped-bar-chart__legend-item">
          <span className="ot-grouped-bar-chart__swatch ot-grouped-bar-chart__swatch--current" />
          {legend[0]}
        </span>
        <span className="ot-grouped-bar-chart__legend-item">
          <span className="ot-grouped-bar-chart__swatch ot-grouped-bar-chart__swatch--prior" />
          {legend[1]}
        </span>
      </div>

      {isEmpty ? (
        <div className="ot-grouped-bar-chart__empty" role="status">
          {emptyLabel ?? '—'}
        </div>
      ) : (
        <div className="ot-grouped-bar-chart__plot">
          <svg
            className="ot-grouped-bar-chart__svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={ariaLabel}
            focusable="false"
          >
            <line
              x1={PAD_L}
              x2={VIEW_W - PAD_R}
              y1={zeroY}
              y2={zeroY}
              className="ot-grouped-bar-chart__axis"
            />
            {series.map((s, i) => {
              const [cur, prev] = s.values;
              const delta = computeDelta(cur, prev);
              const curBar = scaleBar(cur);
              const prevBar = scaleBar(prev);
              const gx = PAD_L + i * groupW;
              const groupInnerOffset = (groupW - (barW * 2 + BAR_GAP)) / 2;
              const deltaTxt =
                delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%)`;
              const label = `${s.label}: ${legend[0]} ${format(cur)} vs ${legend[1]} ${format(prev)}${deltaTxt}`;
              return (
                <g
                  key={`${s.label}-${i}`}
                  className="ot-grouped-bar-chart__group"
                  tabIndex={0}
                  role="img"
                  aria-label={label}
                  data-testid={`gbc-group-${i}`}
                  ref={(el) => {
                    groupRefs.current[i] = el;
                  }}
                  onFocus={() => setFocusedIndex(i)}
                  onMouseEnter={() => setFocusedIndex(i)}
                  onMouseLeave={() => setFocusedIndex((prev) => (prev === i ? null : prev))}
                  onBlur={() => setFocusedIndex((prev) => (prev === i ? null : prev))}
                  onKeyDown={(e) => handleKey(e, i)}
                >
                  <rect
                    x={gx + groupInnerOffset}
                    y={curBar.y}
                    width={barW}
                    height={curBar.h}
                    className="ot-grouped-bar-chart__bar ot-grouped-bar-chart__bar--current"
                  />
                  <rect
                    x={gx + groupInnerOffset + barW + BAR_GAP}
                    y={prevBar.y}
                    width={barW}
                    height={prevBar.h}
                    className="ot-grouped-bar-chart__bar ot-grouped-bar-chart__bar--prior"
                  />
                  <text
                    x={gx + groupW / 2}
                    y={VIEW_H - PAD_B + 20}
                    textAnchor="middle"
                    className="ot-grouped-bar-chart__x-label"
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {tooltipSeries
            ? (() => {
                const [cur, prev] = tooltipSeries.values;
                const delta = computeDelta(cur, prev);
                const deltaTxt =
                  delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
                return (
                  <div
                    className="ot-grouped-bar-chart__tooltip"
                    role="presentation"
                    data-testid="gbc-tooltip"
                  >
                    <strong className="ot-grouped-bar-chart__tooltip-label">
                      {tooltipSeries.label}
                    </strong>
                    <span className="ot-grouped-bar-chart__tooltip-row">
                      <span className="ot-grouped-bar-chart__swatch ot-grouped-bar-chart__swatch--current" />
                      {legend[0]} {format(cur)}
                    </span>
                    <span className="ot-grouped-bar-chart__tooltip-row">
                      <span className="ot-grouped-bar-chart__swatch ot-grouped-bar-chart__swatch--prior" />
                      {legend[1]} {format(prev)}
                    </span>
                    {delta !== null ? (
                      <span
                        className={
                          'ot-grouped-bar-chart__tooltip-delta ' +
                          (delta >= 0
                            ? 'ot-grouped-bar-chart__tooltip-delta--up'
                            : 'ot-grouped-bar-chart__tooltip-delta--down')
                        }
                      >
                        {deltaTxt}
                      </span>
                    ) : null}
                  </div>
                );
              })()
            : null}
        </div>
      )}

      {/* Accessible data-table fallback — hidden visually, exposed to AT. */}
      <table className="ot-sr-only ot-grouped-bar-chart__data-table">
        <caption>{dataTableCaption}</caption>
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{legend[0]}</th>
            <th scope="col">{legend[1]}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((s, i) => (
            <tr key={`row-${s.label}-${i}`}>
              <th scope="row">{s.label}</th>
              <td>{format(s.values[0])}</td>
              <td>{format(s.values[1])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
