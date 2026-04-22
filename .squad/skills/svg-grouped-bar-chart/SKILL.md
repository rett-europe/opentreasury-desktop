# SVG Grouped Bar Chart (Accessible, Zero-Dependency)

**When to use:** You need a small multi-series bar chart primitive in a React app, you want zero chart-lib bundle cost, and you can't compromise on keyboard / screen-reader access.

## Why roll your own

- Chart libs (Recharts, Chart.js, Visx) cost 30–100 KB minified + gzipped. For a single chart with a known shape (N labels × 2 series), you're paying for an entire grammar you won't use.
- Accessibility in chart libs is consistently the weakest surface — most ship canvas output (inaccessible) or rely on their own ARIA scaffolding you can't customise.
- A purpose-built SVG primitive is ~180 LOC total (TSX + CSS + tests) and gives you full control of tab-order, aria-labels, and the screen-reader data-table fallback.

## Core recipe

### 1. Pure SVG with viewBox + CSS responsiveness

```tsx
<svg
  viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
  preserveAspectRatio="xMidYMid meet"
  role="img"
  aria-label={ariaLabel}
  focusable="false"
  style={{ width: '100%', height: 'auto' }}
/>
```

- Fixed internal coordinates (`600 × 340` is a good default aspect) keep bar-math simple.
- `width: 100%; height: auto` makes the SVG fluidly match container width without `ResizeObserver`.
- `focusable="false"` on the root SVG — focus lives on the bar-groups, not the canvas.

### 2. Y-scale that handles negatives

Nets, deltas, PnL can go below zero. Don't silently clamp:

```ts
const maxVal = Math.max(0, ...allValues);
const minVal = Math.min(0, ...allValues);
const range = maxVal - minVal || 1;
const zeroY = PAD_T + (maxVal / range) * CHART_H;

function scaleBar(v: number) {
  const y = PAD_T + ((maxVal - v) / range) * CHART_H;
  return { y: Math.min(y, zeroY), h: Math.abs(y - zeroY) };
}
```

Render the zero baseline as a `<line>` at `zeroY`. Positive bars go up from it, negative bars down.

### 3. Each bar-group is a focusable atom

```tsx
<g
  tabIndex={0}
  role="img"
  aria-label={`${label}: ${legend[0]} ${format(cur)} vs ${legend[1]} ${format(prev)} (${deltaText})`}
  onKeyDown={(e) => handleKey(e, i)}
  onFocus={() => setFocusedIndex(i)}
  ref={(el) => { groupRefs.current[i] = el; }}
>
  <rect ... />
  <rect ... />
  <text ... >{label}</text>
</g>
```

- SVG `<g>` elements are focusable when you give them `tabIndex` — `.focus()` works without `foreignObject`.
- Pack everything the screen reader needs into `aria-label`. No `aria-describedby`.
- Store refs in `useRef<Array<SVGGElement | null>>([])`.

### 4. Keyboard nav — five-key contract

```ts
switch (e.key) {
  case 'ArrowRight': case 'ArrowDown': moveFocus(i + 1); break;
  case 'ArrowLeft':  case 'ArrowUp':   moveFocus(i - 1); break;
  case 'Home':                          moveFocus(0); break;
  case 'End':                           moveFocus(series.length - 1); break;
}
```

- `e.preventDefault()` on handled keys so arrows don't scroll the page.
- **Clamp, don't wrap.** ArrowRight at the last bar should do nothing.

### 5. Screen-reader data-table fallback

This is the secret weapon. Sighted users get the bars; AT users get a proper HTML table:

```tsx
<table className="sr-only">
  <caption>{dataTableCaption}</caption>
  <thead>
    <tr>
      <th scope="col" />
      <th scope="col">{legend[0]}</th>
      <th scope="col">{legend[1]}</th>
    </tr>
  </thead>
  <tbody>
    {series.map((s) => (
      <tr key={s.label}>
        <th scope="row">{s.label}</th>
        <td>{format(s.values[0])}</td>
        <td>{format(s.values[1])}</td>
      </tr>
    ))}
  </tbody>
</table>
```

**Gotchas:**

- **Leave the corner `<th>` empty.** Don't duplicate the caption into the corner cell — testing-library's `within(table).getByText(caption)` will fail with "found multiple elements", and the caption already names the dataset.
- **`scope="col"` / `scope="row"`** matter. Without them SR announces "cell 3 of 3" instead of "Abril, 2026, €1,500.00".

### 6. Tooltip is visual-only

```tsx
<div className="chart__tooltip" role="presentation" style={{ pointerEvents: 'none' }}>
  …
</div>
```

- `role="presentation"` + `pointer-events: none` so the tooltip never steals focus or SR attention.
- The focused group's `aria-label` already carries everything the tooltip displays. Don't duplicate with `aria-describedby`.
- Pinning the tooltip to a fixed corner of the plot avoids edge-overflow bugs at the first/last bar positions. Anchor to the focused bar only if the design explicitly demands it.

## Tokens, not hex

| Purpose | Token |
|---|---|
| Current-series bar fill | `--color-brand-primary` |
| Prior-series bar fill | `--color-brand-primary-muted` |
| Focus ring | `--color-focus-ring` |
| Axis / grid lines | `--color-border-subtle` |
| Tooltip surface | `--color-surface-raised` |
| Tooltip border | `--color-border-default` |
| Tooltip up-delta text | `--color-income-default` |
| Tooltip down-delta text | `--color-expense-default` |
| X-axis labels | `--color-text-muted` |
| Empty-state surface | `--color-surface-secondary` |

## Testing checklist

1. Group count matches `series.length`.
2. Data-table rows = 1 header + `series.length`, column headers = `legend.length + 1`.
3. Locale-formatted currency appears in data-table cells for both series.
4. Tooltip appears on focus; shows both series values and delta %.
5. Empty state renders when all values are 0 *and* bars are suppressed.
6. Arrow keys advance / retreat focus between groups.
7. Home/End jump to bounds.
8. Focused group's `aria-label` contains label + both legend strings + both formatted values + delta %.

## Anti-patterns

❌ **`navigator.language` anywhere in the primitive.** Locale is a prop; parent derives it from `i18n.language`.
❌ **Inline `new Intl.NumberFormat(...)`.** Use a shared `formatCurrency(value, locale, currency)` helper.
❌ **`aria-live` on the tooltip.** Will spam the screen reader on every mouse move.
❌ **Projected / synthetic values inside the chart.** Do projections outside; pass actuals only. The chart is dumb.
❌ **Wrapping keyboard nav.** Confuses positional SR users.
❌ **Canvas.** You lose DOM-level a11y.
❌ **Hardcoded bar widths.** Compute from `chartWidth / groupCount` minus a gap constant.

## Reference implementation

- `app/src/renderer/components/GroupedBarChart/GroupedBarChart.tsx` (WI-22, PR #8)
- Paired tests: `GroupedBarChart.test.tsx` (8 tests)
- CSS (tokens only): `GroupedBarChart.css`

## When NOT to use this

- You need a **third series** or arbitrary-count series — the recipe's tuple type assumes exactly two.
- You need **axes with tick labels + grid lines**. Adding them is straightforward but at 300+ LOC a library becomes reasonable.
- You need **animated transitions between data sets** (FLIP-style bar morphing). Reach for a lib.
