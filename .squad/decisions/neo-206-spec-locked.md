# Dataset Compatibility & Validation Spec (#206) — Decisions Locked

**Date:** 2026-05-02  
**Decision maker:** Pedro (owner)  
**Approver methodology:** Accepted all of Niobe's recommendations as binding for M1 implementation.

---

## Summary

Spec #206 (Dataset Compatibility & Validation) has been approved with all 6 open questions resolved. All decisions are locked and documented in `docs/specs/dataset-compatibility-validation.md` § Resolved Decisions.

---

## Locked Decisions

1. **Decision 1: Migration Optionality** — Optional for M1 (good UX, no forced actions); required for M2+ (cleaner state).

2. **Decision 2: Manifest File** — Ship M1 without `dataset-manifest.json`; add in M2 when replication needs cheap proofs.

3. **Decision 3: appVersion Field** — Best-effort recording at creation is sufficient for M1; consider `appVersionHistory` enhancement in M2 if audit trail needed.

4. **Decision 4: Backward Compatibility Chain** — Run sequential migrations (v1→v2→v3) without interruption; user clicks once.

5. **Decision 5: First-Run Repair Option** — Hard reject for M1 (safer); consider repair UX for M2 based on user feedback.

6. **Decision 6: SCHEMA_TOO_OLD Error UX** — Surface as "contact support" unless we have a roadmap date; avoid false hope.

---

## Next Steps

- **Part 2 (Neo):** Decompose work decomposition section (11 items) into GitHub sub-issues, grouped into 4–6 implementable work packages.
- **Implementation:** Morpheus + Trinity + Cypher + Switch per issue ownership assignments.
- **Parent tracking:** Issue #206 remains open as umbrella; sub-issues will reference it and feed back completion status.

---

## Appendix: Rationale Summary

All decisions prioritize **M1 simplicity and safety over ambitious early features**:
- Migration is optional (no forced upgrades that could break workflows).
- Manifest file deferred (corruption checks via JSON schema are sufficient for M1).
- appVersion recorded simply (audit trail is M2+ complexity).
- Migrations run sequentially (one UX interaction, multiple schema hops).
- Foreign datasets rejected (avoid data loss risks without user intent).
- Error messages are honest (support over false hope).

This reflects Niobe's analysis: **M1 is a solid, focused foundation; M2 will add distributed replication needs that justify the extra complexity.**
