# Skill: UX Concept Proposal (no-code design doc)

**Owner:** Niobe
**Created:** 2026-05-04
**Trigger:** Pedro (or any reviewer) rejects a shipped UX as "confusing/not resolved" AND/OR team rule requires a concept before re-implementation.

## When to use

- A visual/UX feature has shipped and dogfooding revealed it doesn't land.
- A new visualisation or layout pattern is being proposed and the team wants alternatives compared before code.
- Any time the cost of getting it wrong (re-shipping, retraining users) exceeds the cost of one design pass.

**Do NOT use for:** trivial spacing/colour fixes (Mouse owns), pure copy changes, or features already covered by a locked spec.

## Output format (proven to work, ~1500–2500 words)

1. **User need (1 short section).** State the *cognitive task* the user is performing — not the feature, the task. Decompose into 2–3 ranked sub-tasks. Explicitly name tasks that are NOT in scope (because they're served by adjacent panels).
2. **Failure-mode diagnosis of the current implementation (3–6 bullets).** Specific, not generic. Each failure mode names the mechanism (e.g. "central zero baseline is decorative because rows are paired by rank index, not by shared key"). Reference code paths. If snapshots aren't available, say so and infer from code — don't pretend.
3. **Three alternatives.** For EACH: name + one-line summary, ASCII/markdown sketch, pros, cons, cost (low/medium/high — be honest), and "good fit when". Pick three that span the design space (cheap-and-safe, medium-and-different, weird-and-interesting).
4. **One recommendation.** Single paragraph. Name the trade-off you're accepting. Optionally name a "+1 day" upgrade path.
5. **Open questions for the requester.** 5–7 questions. The first should be the one that would flip your recommendation. Include process questions (e.g. "wait for snapshots?").
6. **What this doc does NOT decide.** Hand-off to other agents (visual styling → Mouse, code → Trinity/Morpheus, etc.).

## Critical rules

- **No code.** This is a markdown doc. Resist the urge to draft TSX.
- **Cite the prior decision being walked back.** If you contradict a previously locked rule in `.squad/decisions.md`, name it explicitly and explain what changed (usually: dogfood signal). Let the human arbitrate.
- **Match visualisation to cognitive task.** Rank-and-scan ≠ compare-pairs ≠ part-of-whole ≠ trend-over-time. A wrong-task chart is wrong even if it's beautiful.
- **Don't re-litigate the spec.** Stay in the panel/feature being challenged. If the surrounding IA is implicated, raise it as an open question — don't redesign.
- **ASCII sketches are enough.** Mouse will draw the real thing if the concept is approved. Optimise for "communicates the layout" not "looks pretty."

## Heuristics for the failure-mode section

Common failure modes to check for:
- Metaphor implies a comparison that doesn't exist (e.g. diverging bars on disjoint keys).
- Reading direction reversed vs. rest of the app (forces re-orientation).
- Labels truncate at the most common viewport size.
- Responsive collapse becomes a *different* chart, not the same chart smaller.
- Severed link between adjacent panels (donut click doesn't propagate, etc.).
- Chart convention applied to non-chart data (axis lines, baselines, gridlines).

## Heuristics for picking three alternatives

- **One should be the cheapest, safest version of the user's stated task** (often: "tables with inline bars"). This is your fallback if everything else is rejected.
- **One should question the IA**, e.g. "do we even need this panel separately or can it merge upward?". This is your stretch option.
- **One should be visually distinctive** so the requester has a clear "I like that one" / "definitely not that one" reaction. This is your calibration option.

## Reference output

`docs/ux/insights-subcategory-concept.md` (2026-05-04) — proposed Concept A (ranked tables) over Concept B (donut drill-down) and Concept C (category-stacked bars), walking back the 2026-04-28 diverging-bar decision.
