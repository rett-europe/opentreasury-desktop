# Session Log — ADR-002 Accepted, Roadmap Reshaped

- **Timestamp:** 2026-04-19T09:51:00Z
- **Requested by:** Pedro (perocha)
- **Branch:** docs/roadmap-v1-and-first-prds
- **Mode:** parallel sync (Neo + Link)

## Material changes

### Architecture (Neo)
- **ADR-002 Proposed → Accepted.** Five repo-structure questions closed: npm, no monorepo tool, strict TS + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, flat `app/`, hybrid tests.
- §11 Implementation Next Steps + Changelog added. `app/` scaffolding, Vitest, Playwright land in a follow-up PR.

### Product (Link) — 5 scope decisions
1. **Pilot NGO = Rett Spain** (Spanish-first), **dogfooder = Pedro**.
2. **No pending / draft / provisional transaction concept anywhere.** All transactions are confirmed from statement import (CSV) or manual entry. PRD-001 PR9/S5/PR7/PR8/PR11, PRD-002 PR13, PRD-003 PR11 rewritten. PRD-plan §0.1 Assumptions codifies this.
3. **i18n is foundational — M0, not M3.** PRD-009 re-scoped from feature to infrastructure. Both ES + EN are v1.0 ship-blockers. Dep graph reshaped so i18n flows out of M0.
4. **OneDrive v1 scope = Business / SharePoint only.** Personal deferred to v1.x with re-entry trigger documented.

### Cross-team fallout
- Neo: i18n framework selection (e.g., i18next vs react-intl) is now an M0 deliverable — short ADR or spec note needed.
- Switch: narrower v1 threat model (no consumer-account ACLs) — note for next security-reqs revision.
- Niobe: drop pending-state UX, add folder-picker rejection state for Personal OneDrive, all UX strings need ES+EN at handoff.
- Mouse: no pending visuals; plan for EN ~30% longer than ES.
- Cypher: no pending-state test cases; i18n (ES+EN) testing from M1; hybrid test layout confirmed.
- Oracle: docs are bilingual (ES+EN) from v1.
- Trinity / Morpheus: transactions always confirmed; i18n is day-0; ADR-002 layout locked; app/ scaffolding is next PR.
