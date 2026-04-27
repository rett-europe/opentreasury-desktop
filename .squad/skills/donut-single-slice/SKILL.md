# Skill — Donut chart: render a single 100% slice as a full ring

## Problem

Most SVG donut charts draw each slice as a `<circle>` with `stroke-dasharray="${arcLength} ${circumference}"` and `stroke-dashoffset` to rotate the start point. This works perfectly for ≥2 slices and any single slice <100%.

It **fails** when a single slice covers the entire ring (1 label / 100%): the donut renders with a missing wedge — the classic "Pac-Man" bug.

## Why it fails (the math)

For a circle of circumference `C` and one slice with `arcLength = C`:

- `stroke-dasharray = "C C"` → pattern: dash of length C, gap of length C, repeating.
- `stroke-dashoffset = -C/4` (to start the slice at 12 o'clock instead of 3 o'clock).

The dashoffset shifts the pattern along the path. The path itself has length `C`. So along the path positions `0..C`, the visible portion of the dash pattern is `0..3C/4` (dash) and `3C/4..C` (gap). Result: 75% of the ring renders, 25% is invisible — Pac-Man.

This only manifests at exactly (or arbitrarily close to) 100% because that's the only case where the path length equals the dash length and the offset can push the tail into the gap segment of the pattern.

## Fix

When a segment covers the full circle, **stop using `stroke-dasharray`**. Render a plain stroked circle:

```tsx
if (segments.length === 1 && seg.percentage >= 99.999) {
  return (
    <circle
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={color}
      strokeWidth={thickness}
    />
  );
}
```

Use `>= 99.999` (not `=== 100`) to absorb floating-point rounding from `(value/total) * 100`.

## Alternative fixes (less clean)

- `stroke-dasharray="${C - 0.01} ${C + 1}"` — visually masks the bug but leaves a sub-pixel seam.
- Two complementary half-arcs via `<path d="M ... A ...">` — works but is heavier and only justified if you need gradient fills per slice.
- Drop the rotation (`-C/4` offset) and accept the slice starting at 3 o'clock — visually inconsistent with multi-slice mode.

The plain `<circle>` is the canonical fix.

## Regression test pattern

```ts
it('renders a single 100% slice as a full ring (no Pac-Man gap)', () => {
  const { container } = render(<DonutChart slices={[{ value: 500, … }]} total={500} … />);
  const seg = container.querySelector('circle.segment-class')!;
  expect(seg.getAttribute('stroke-dasharray')).toBeNull();
  expect(seg.getAttribute('stroke-dashoffset')).toBeNull();
});
```

## Where this lives in opentreasury-desktop

- Component: `app/src/renderer/components/DonutChart/DonutChart.tsx`
- Test: `app/src/renderer/components/DonutChart/DonutChart.test.tsx` (`renders a single 100% slice as a full ring`)
- Originally fixed in PR #115 (Insights drilldown bug report).

## When to apply

Any new chart component or fork that uses the dasharray-on-circle technique. If you see "donut renders 75% of the ring with one slice", this is the cause every time.
