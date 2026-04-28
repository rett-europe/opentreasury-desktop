# Insights drilldown — round 2 snapshots (Dot D + Palette P1)

Captured by `tests/e2e/insights-snapshots.spec.ts` with
`OT_SNAPSHOTS=1 OT_SNAPSHOTS_OUT=docs/ux/insights-after-d-p1`.

Both visual changes from `docs/ux/dots-and-colors-options.md` are applied:

- **Dot D** — the standalone colour dot is gone; the rank pill itself now
  carries the category colour as a low-alpha tint (mirrors the Movements
  `ot-type-arrow` chip pattern).
- **Palette P1** — `--color-donut-0..7` redefined as a wide-hue OKLCH
  respread (45° hue spacing, alternating L). Same OKLCH model and muted
  feel as v0.3; the d2↔d3 and d4↔d5 collisions are gone.

The "before" set (Dot A + legacy palette) lives at `../insights-after/`.
Compare each filename pair to see the change.

| File | Scenario |
| --- | --- |
| `normal-wide-full.png` | typical month, 1600×1000 — donut + tables |
| `normal-wide-bars.png` | same, ranked-tables close-up |
| `normal-narrow-full.png` | typical month, 900×1100 — stacked layout |
| `normal-narrow-bars.png` | same, ranked-tables close-up |
| `skewed-wide-full.png` | one mega expense, 1600×1000 |
| `skewed-wide-bars.png` | same, close-up |
| `skewed-narrow-full.png` | one mega expense, 900×1100 |
| `skewed-narrow-bars.png` | same, close-up |
| `sparse-wide-full.png` | 2–3 entries per side, 1600×1000 |
| `sparse-wide-bars.png` | same, close-up |
| `sparse-narrow-full.png` | 2–3 entries per side, 900×1100 |
| `sparse-narrow-bars.png` | same, close-up |
