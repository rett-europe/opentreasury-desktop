# Session Log — 2026-04-19T15:10:00Z

**Requested by:** Pedro (perocha)
**Topic:** Repo structure ADR-002, roadmap v1, first three PRDs, UX baseline.
**Branch:** `docs/roadmap-v1-and-first-prds`

## Sequence

1. **Neo (sync)** — wrote ADR-002 repo structure (Proposed), scaffolded `docs/ux/`, `docs/design/`, `docs/specs/` (README + _template), `scripts/`, `.github/` (workflows, issue templates, PR template). 5 open questions for Pedro.
2. **Link + Niobe (parallel sync)** — Link wrote roadmap v1 (5 milestones, 3 gates), PRD plan (22 reservations), first 3 PRDs (movements, saldo, panel), updated vision.md. Niobe wrote prototype-analysis-v1, ux-spec-plan (28 specs, 4 waves), and 3 flow skeletons.

## Outcomes

- ADR-002 **Proposed** — blocks on 5 Pedro answers before Accepted.
- Roadmap v1 **Draft** — M1 = single-user happy path covering prototype's 3 canonical screens.
- 3 PRDs **Draft** — encode team's locked product decisions.
- UX baseline published — 12 prototype gaps cataloged, 28 specs enumerated, 3 flow skeletons anchor Wave 1.
- Prototype's empty-on-open violation surfaced and corrected in flow-003.

## Open for Pedro

- Neo: package manager, monorepo tool, TS strictness, app layout, tests layout.
- Link: pilot NGO, alpha dogfooder, pending-tx policy confirm, default date preset, i18n EN timing, OneDrive scope.
- Niobe: vision Q6 (ES+EN), Panel recent-tx range, remember last-opened folder, universal Ctrl/Cmd+N, admin transfer placement.

## Branch note

All three agents worked on `docs/roadmap-v1-and-first-prds` (created by Link). Commit lands on that branch; Pedro decides merge/rebase into main via PR.
