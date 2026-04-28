# SVG Donut Chart Pattern

**Status:** Production-ready  
**Created:** 2026-04-26 (PR #99)  
**Author:** Mouse  
**Component:** DonutChart  
**Use case:** Category distribution visualization with pure SVG + stroke-dasharray

---

## Problem

Need responsive donut charts for category/tag distribution that:
- Work without external chart libraries (bundle size, offline-first)
- Support deterministic color palettes (same input → same colors)
- Handle edge cases: empty, single-segment, many segments
- Aggregate tail categories into "Otras" bucket when >5 slices
- Provide accessibility (screen reader data table)
- Animate smoothly (transition on data change)

## Solution

Pure SVG circle elements with a one-shot `stroke-dasharray` per slice plus a
**per-slice `transform="rotate(...)"`** to position each segment. CSS custom
properties for theme-aware colors.

### Core Technique

```tsx
// 1. Calculate circle geometry
const radius = (size - thickness) / 2;
const circumference = 2 * Math.PI * radius;
const center = size / 2;

// 2. For each slice, calculate dash length and start angle.
let currentAngle = -90; // -90° = 12 o'clock
const segments = slices.map((slice) => {
  const fraction = slice.value / total;
  const dashLength = fraction * circumference;
  const startAngle = currentAngle;
  currentAngle += fraction * 360;
  return { slice, dashLength, startAngle, percentage: fraction * 100 };
});

// 3. Render one <circle> per segment, rotated to its start angle. The dash
//    always starts at path position 0, so the entire dash fits in [0, L].
segments.map((seg, idx) => (
  <circle
    cx={center}
    cy={center}
    r={radius}
    fill="none"
    stroke={`var(--color-donut-${idx % 8})`}
    strokeWidth={thickness}
    strokeDasharray={`${seg.dashLength} ${circumference}`}
    transform={`rotate(${seg.startAngle} ${center} ${center})`}
  />
));
```

### Why rotate (not strokeDashoffset)?

The earlier implementation positioned each segment by setting
`strokeDashoffset = -C/4 - sum(prevDashLengths)`. That works for evenly
distributed data, but breaks for **any segment whose dash region begins at
a non-zero path offset and extends past the path end**: SVG `<circle>`
strokes do **not** wrap continuously across the closing point, so the
trailing portion of the dash is silently clipped. This produces a
wedge-shaped gap (the "Pac-Man bug") for any slice ≥ ~75% of the
circumference, *and* for skewed distributions where one slice dominates
most of the ring.

Rotating the circle so each segment's dash starts at path position 0
keeps the whole dash in-bounds for every fraction in [0, 1]. The 100%
case still gets a special-case full ring (no dasharray) for cleanliness.

### Edge cases

- **Empty:** render a single grey ring (no segments).
- **Single 100% slice:** render a plain stroked ring with no dasharray
  (avoids any seam).
- **Sub-pixel rounding:** since each segment is independent, accumulated
  rounding errors don't propagate across segments.
- **>5 slices:** aggregate the tail into an `__otras__` bucket before
  segmenting (constant deterministic colour `--color-donut-otras`).

### References

- **Component:** `app/src/renderer/components/DonutChart/DonutChart.tsx`
- **Tests:** `app/src/renderer/components/DonutChart/DonutChart.test.tsx`
  (includes Pac-Man regression tests)
- **CSS:** `app/src/renderer/components/DonutChart/DonutChart.css`
- **Color hash:** `app/src/renderer/utils/colorHash.ts`
- **Spec:** `docs/ux/specs/ux-005-insights-final-spec.md` §5.1
- **PRs:** #99 (initial), #114 (donut-companion bar), Trinity insights-detail-polish (Pac-Man fix via rotation)

