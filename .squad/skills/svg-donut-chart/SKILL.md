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

Pure SVG circle elements with `stroke-dasharray` + `stroke-dashoffset` to create donut segments. CSS custom properties for theme-aware colors.

### Core Technique

```tsx
// 1. Calculate circle geometry
const radius = (size - thickness) / 2;
const circumference = 2 * Math.PI * radius;
const center = size / 2;

// 2. For each slice, calculate dasharray + dashoffset
let currentAngle = -90; // Start at top
const segments = slices.map((slice) => {
  const percentage = (slice.value / total) * 100;
  const dashLength = (percentage / 100) * circumference;
  const angle = currentAngle;
  currentAngle += (percentage / 100) * 360;

  return { slice, dashLength, angle, percentage };
});

// 3. Render overlapping circles with cumulative offset
let accumulatedOffset = 0;

segments.map((seg, idx) => {
  const offset = -circumference / 4 - accumulatedOffset;
  accumulatedOffset += seg.dashLength;

  return (
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={`var(--color-donut-${idx % 8})`}
      strokeWidth={thickness}
      strokeDasharray={`segmentLength circumference`}
      strokeDashoffset={offset}
    />
  );
});
```

### References

- **Component:** `app/src/renderer/components/DonutChart/DonutChart.tsx`
- **Tests:** `app/src/renderer/components/DonutChart/DonutChart.test.tsx`
- **CSS:** `app/src/renderer/components/DonutChart/DonutChart.css`
- **Color hash:** `app/src/renderer/utils/colorHash.ts`
- **Spec:** `docs/ux/specs/ux-005-insights-final-spec.md` §5.1
- **PR:** #99
