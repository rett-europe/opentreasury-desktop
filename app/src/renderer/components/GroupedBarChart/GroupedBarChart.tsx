import { type KeyboardEvent, useRef, useState } from 'react';
import { useFormatters } from '../../format/index.js';
import './GroupedBarChart.css';

export type GroupedBarChartLegendItem = {
  readonly label: string;
  readonly className?: string;
};

export type GroupedBarChartGroup = {
  readonly label: string;
  readonly values: ReadonlyArray<number>;
  /**
   * Per-bar class names (matched by index). When omitted, falls back to the
   * default `--current` / `--prior` alternation.
   */
  readonly barClassNames?: ReadonlyArray<string>;
  /** When true, render a vertical visual divider just BEFORE this group. */
  readonly dividerBefore?: boolean;
};

export type GroupedBarChartProps = {
  readonly series: ReadonlyArray<{
    readonly label: string;
    readonly values: ReadonlyArray<number>;
    readonly barClassNames?: ReadonlyArray<string>;
    readonly dividerBefore?: boolean;
  }>;
  /**
   * Legend entries. Each item may be a plain string (classic 2-series mode,
   * styled with default current/prior swatches) or an object specifying a
   * custom swatch class name.
   */
  readonly legend: ReadonlyArray<string | GroupedBarChartLegendItem>;
  readonly currency?: string;
  readonly ariaLabel: string;
  readonly dataTableCaption: string;
  /** Optional localized "no data" message. Parent should pass `t('...')`. */
  readonly emptyLabel?: string | undefined;
};

// SVG viewBox constants — responsive via CSS width: 100%.
// viewBox aspect (4:1) chosen to match typical rendered container aspect
// (~280px tall × ~1100px wide), minimising anisotropic text distortion when
// preserveAspectRatio="none" is used to fill the card on wide screens.
const VIEW_W = 1200;
const VIEW_H = 300;
const PAD_L = 64;
const PAD_R = 32;
const PAD_T = 24;
const PAD_B = 56;
const CHART_W = VIEW_W - PAD_L - PAD_R;
const CHART_H = VIEW_H - PAD_T - PAD_B;
const BAR_GAP = 2;
const DEFAULT_BAR_CLASSES = [
  'ot-grouped-bar-chart__bar--current',
  'ot-grouped-bar-chart__bar--prior',
] as const;
const DEFAULT_SWATCH_CLASSES = [
  'ot-grouped-bar-chart__swatch--current',
  'ot-grouped-bar-chart__swatch--prior',
] as const;

function computeDelta(current: number, prior: number): number | null {
  if (prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

function legendLabel(item: string | GroupedBarChartLegendItem): string {
  return typeof item === 'string' ? item : item.label;
}

function legendClass(item: string | GroupedBarChartLegendItem, fallback: string): string {
  if (typeof item === 'string') return fallback;
  return item.className ?? fallback;
}

export function GroupedBarChart({
  series,
  legend,
  currency = 'EUR',
  ariaLabel,
  dataTableCaption,
  emptyLabel,
}: GroupedBarChartProps): JSX.Element {
  const { formatCurrency } = useFormatters();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const groupRefs = useRef<Array<SVGGElement | null>>([]);

  const format = (n: number): string => formatCurrency(n, currency);

  const isEmpty = series.every((s) => s.values.every((v) => v === 0));

  const allValues = series.flatMap((s) => Array.from(s.values));
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
  const barsPerGroup = Math.max(1, legend.length);
  const barW = Math.max(2, (groupW - BAR_GAP * (barsPerGroup - 1) - 6) / barsPerGroup);

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

  const buildAriaLabel = (s: GroupedBarChartProps['series'][number]): string => {
    if (legend.length === 2 && s.values.length === 2) {
      const cur = s.values[0] ?? 0;
      const prev = s.values[1] ?? 0;
      const delta = computeDelta(cur, prev);
      const deltaTxt = delta === null ? '' : ` (${delta >= 0 ? '+' : ''}${Math.round(delta)}%)`;
      return `${s.label}: ${legendLabel(legend[0]!)} ${format(cur)} vs ${legendLabel(legend[1]!)} ${format(prev)}${deltaTxt}`;
    }
    const parts = legend
      .slice(0, s.values.length)
      .map((l, i) => `${legendLabel(l)} ${format(s.values[i] ?? 0)}`)
      .join(' · ');
    return `${s.label}: ${parts}`;
  };

  return (
    <div className="ot-grouped-bar-chart">
      <div className="ot-grouped-bar-chart__legend" aria-hidden="true">
        {legend.map((l, i) => (
          <span key={`legend-${i}`} className="ot-grouped-bar-chart__legend-item">
            <span
              className={`ot-grouped-bar-chart__swatch ${legendClass(l, DEFAULT_SWATCH_CLASSES[i] ?? '')}`}
            />
            {legendLabel(l)}
          </span>
        ))}
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
            preserveAspectRatio="none"
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
              if (!s.dividerBefore) return null;
              const x = PAD_L + i * groupW;
              return (
                <line
                  key={`divider-${i}`}
                  x1={x}
                  x2={x}
                  y1={PAD_T}
                  y2={VIEW_H - PAD_B}
                  className="ot-grouped-bar-chart__divider"
                />
              );
            })}
            {series.map((s, i) => {
              const gx = PAD_L + i * groupW;
              const totalBarsW = barW * s.values.length + BAR_GAP * (s.values.length - 1);
              const groupInnerOffset = (groupW - totalBarsW) / 2;
              const label = buildAriaLabel(s);
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
                  {s.values.map((v, bi) => {
                    const bar = scaleBar(v);
                    const cls =
                      s.barClassNames?.[bi] ?? DEFAULT_BAR_CLASSES[bi] ?? DEFAULT_BAR_CLASSES[0];
                    return (
                      <rect
                        key={`bar-${bi}`}
                        x={gx + groupInnerOffset + bi * (barW + BAR_GAP)}
                        y={bar.y}
                        width={barW}
                        height={bar.h}
                        className={`ot-grouped-bar-chart__bar ${cls}`}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          {/* HTML month labels — rendered outside the SVG so SVG scaling
              (preserveAspectRatio="none") does not distort glyphs. Aligned
              with groups using flex-based fractional spacing that mirrors the
              viewBox geometry. */}
          <div
            className="ot-grouped-bar-chart__x-labels"
            aria-hidden="true"
            style={{
              paddingLeft: `${(PAD_L / VIEW_W) * 100}%`,
              paddingRight: `${(PAD_R / VIEW_W) * 100}%`,
            }}
          >
            {series.map((s, i) => (
              <span key={`label-${i}`} className="ot-grouped-bar-chart__x-label">
                {s.label}
              </span>
            ))}
          </div>

          {tooltipSeries
            ? (() => {
                const showDelta = legend.length === 2 && tooltipSeries.values.length === 2;
                const delta = showDelta
                  ? computeDelta(tooltipSeries.values[0] ?? 0, tooltipSeries.values[1] ?? 0)
                  : null;
                const deltaTxt =
                  delta === null ? '—' : `${delta >= 0 ? '+' : ''}${Math.round(delta)}%`;
                return (
                  <div
                    className="ot-grouped-bar-chart__tooltip"
                    role="presentation"
                    data-testid="gbc-tooltip"
                  >
                    <strong className="ot-grouped-bar-chart__tooltip-label">
                      {tooltipSeries.label}
                    </strong>
                    {tooltipSeries.values.map((v, bi) => {
                      const l = legend[bi];
                      if (l === undefined) return null;
                      const cls =
                        tooltipSeries.barClassNames?.[bi] ??
                        legendClass(l, DEFAULT_SWATCH_CLASSES[bi] ?? '');
                      return (
                        <span key={`row-${bi}`} className="ot-grouped-bar-chart__tooltip-row">
                          <span className={`ot-grouped-bar-chart__swatch ${cls}`} />
                          {legendLabel(l)} {format(v)}
                        </span>
                      );
                    })}
                    {showDelta && delta !== null ? (
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
            {legend.map((l, i) => (
              <th key={`th-${i}`} scope="col">
                {legendLabel(l)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {series.map((s, i) => (
            <tr key={`row-${s.label}-${i}`}>
              <th scope="row">{s.label}</th>
              {legend.map((_, bi) => (
                <td key={`td-${bi}`}>{format(s.values[bi] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
