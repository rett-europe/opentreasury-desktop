# Skill: Visual Design Gate

**Owner:** Neo (orchestration), Trinity (snapshots), Niobe (concept)
**Created:** 2026-05-04
**Trigger:** A shipped visual/UX change is rejected during dogfooding, OR the team's design-before-code directive applies to a new feature.

## When to use

- Pedro (or any reviewer) rejects a shipped visual as "confusing / not resolved."
- A new visualisation, chart, or layout pattern is proposed and the 2026-04-28 directive requires a concept proposal with screenshots before implementation.
- Any visual change where the cost of getting it wrong (re-shipping, context switching) exceeds the cost of one design pass (~half a day of agent time).

**Do NOT use for:** trivial spacing/colour fixes (Mouse owns), copy-only changes, or features already covered by an approved UX spec.

## The cycle (3 parallel → 1 sequential)

### Phase 1 — Evidence capture (Trinity, ~1–2 hours)

1. Write or reuse a Playwright snapshot harness that seeds deterministic data and captures the current state.
2. Cover **3 dataset shapes** (normal, skewed/dominated, sparse) × **2 viewport widths** (wide ≥1400 px, narrow ~900 px) = 12 screenshots minimum.
3. Output: a `docs/ux/<feature>-current-state/` directory with PNGs + a `README.md` indexing every image with a one-line caption.
4. Add a brief "Observations" section listing surface-level visual problems — factual, not prescriptive.
5. The snapshot spec must be **skipped by default** so CI isn't affected.

### Phase 2 — UX concept (Niobe, ~2–3 hours, runs in parallel with Phase 1)

Use the `ux-concept-proposal` skill (`docs/ux/<feature>-concept.md`). Key outputs:
- User need decomposed into ranked sub-tasks.
- 3–6 failure-mode bullets with mechanisms, not just symptoms.
- 3 alternative concepts spanning the design space (cheap-safe, medium-different, stretch).
- 1 recommendation with trade-off named.
- 5–7 open questions for the requester.

### Phase 3 — Lead synthesis (Neo, ~1 hour, after Phases 1+2 complete)

1. Read both inputs. Do not rewrite them — synthesise.
2. Produce a **decision document** (`docs/ux/<feature>-decision.md`) with these sections:
   - **Problem** (1 paragraph, tightened from Niobe's diagnosis).
   - **Snapshot evidence** (2–3 most damning images with relative paths and 1-line captions).
   - **Alternatives table** (Concept | Best for | Cost | Risk | Reusability — one row per concept).
   - **Single recommendation** (3–4 sentences, decisive, names the trade-off).
   - **Blocking open questions** (cut from Niobe's list to the 2–3 that would change the recommendation; defer the rest to PR review).
   - **Path to ship** (owner, PR scope, revert scope, test expectations).
   - **Not-in-v1 list** (tempting features explicitly deferred).
3. Drop a 4-line summary to `.squad/decisions/inbox/` for the Scribe.

## Critical rules

- **No production code changes in this cycle.** All outputs are markdown.
- **One clear recommendation, not three hedged options.** Neo picks one; Pedro approves or redirects.
- **Snapshot evidence is non-negotiable.** Without it, diagnosis is inference from code — weaker and disputable.
- **Open-question triage is the lead's job.** Don't dump 7 questions on the requester — prioritise to the 2–3 that are actually blocking and defer the rest.
- **The decision doc targets the requester (Pedro), not the implementing agent.** Write for a human who will skim headings, read the table, and check the recommendation paragraph.

## Proven instance

- **Feature:** Insights subcategory panel (diverging-bar chart, PR #141).
- **Trinity output:** `docs/ux/insights-current-state/` (12 PNGs + README).
- **Niobe output:** `docs/ux/insights-subcategory-concept.md`.
- **Neo output:** `docs/ux/insights-subcategory-decision.md`.
- **Cycle time:** ~half a day total (Phases 1+2 parallel, Phase 3 sequential).
