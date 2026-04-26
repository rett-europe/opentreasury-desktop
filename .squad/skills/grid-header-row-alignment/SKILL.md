# SKILL: CSS Grid header / row alignment via shared custom properties

**Owner:** Trinity (Frontend Dev)
**First captured:** 2026-04-26 (PR #91 saldo iter 4)

## Problem

You have a "table-like" layout built with CSS Grid: a header `<div>` (column labels) and a sibling rows wrapper containing many row `<div>`s. Each row has the same `grid-template-columns` template as the header. You want the header labels to sit DIRECTLY above their respective columns.

When the column widths depend on the runtime-measured content of the rows (e.g. widest formatted currency in the panel), it's tempting to compute the widths once and inject them as CSS custom properties on the rows wrapper:

```tsx
<div className="header" />                     {/* ❌ no vars here */}
<div className="rows" style={{
  '--col-prior': '9ch',
  '--col-current': '10ch',
}} />
```

```css
.header, .row {
  display: grid;
  grid-template-columns: 1fr var(--col-prior, max-content) var(--col-current, max-content) auto;
}
```

The header silently uses the `max-content` fallback — which differs from the rows' measured widths — so the header columns drift slightly out of alignment with the row columns. On narrow viewports this can collapse the header into what looks like a vertical stack (Pedro: "the header has text in rows").

## Rule

**If two siblings share a `grid-template-columns` template parameterised by CSS custom properties, BOTH siblings must receive the same custom-property values.** The simplest fix is to apply the same `style` object to both:

```tsx
const colsStyle = {
  '--col-prior': panelColWidths.prior,
  '--col-current': panelColWidths.current,
} as React.CSSProperties;

<div className="header" style={colsStyle} />
<div className="rows" style={colsStyle} />
```

Or hoist the variables one level up to a common ancestor:

```tsx
<section style={colsStyle}>
  <div className="header" />
  <div className="rows" />
</section>
```

The hoisted variant is preferred when there are 3+ siblings or when a future component will join the column system.

## Why fallbacks are dangerous

`var(--col-prior, max-content)` looks safe but the fallback is evaluated against DIFFERENT content in the header vs the rows:
- Header column 2 contains the year label `2025` → ~3ch.
- Row column 2 contains a currency string `32.181 €` → ~9ch.

Even tiny mismatches accumulate across columns and can blow past the panel width on narrow viewports, causing visible misalignment or apparent column wrapping.

## Quick check

In dev tools, set both elements' computed `grid-template-columns` to identical pixel values. If they differ, you have this bug.

## See also

- `.squad/decisions/inbox/trinity-saldo-iter4.md` — concrete fix in PR #91.
- `app/src/renderer/screens/SaldoScreen/SaldoScreen.tsx` lines 1196–1235 — the `panelRowsStyle` object now applied to BOTH the `__columns` header and the `__rows` wrapper.
