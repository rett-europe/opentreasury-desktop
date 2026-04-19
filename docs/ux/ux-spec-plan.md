# UX Spec Plan — OpenTreasury Desktop v1

> **Status:** Draft v1 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-19
> **Predicates:** [`prototype-analysis-v1.md`](./prototype-analysis-v1.md); vision v0.1; ADR-001; crypto-spec v1.0; security-requirements v0.2.
> **Coordinates with:** Link (PRDs 001–003 in parallel); Mouse (design tokens); Switch (security-sensitive copy).

---

## 1. Purpose

Enumerate every UX spec needed for v1, in priority order, with owners, dependencies, and traceability to PRDs (Link), ADR conditions (Neo), and security requirements (Switch). Three seed flow skeletons ship alongside this plan:

- [`flows/flow-001-first-run-setup.md`](./flows/flow-001-first-run-setup.md)
- [`flows/flow-002-device-enrollment.md`](./flows/flow-002-device-enrollment.md)
- [`flows/flow-003-movements-date-range.md`](./flows/flow-003-movements-date-range.md)

---

## 2. Priority Tiers

| Tier | Meaning |
|---|---|
| **T1 — Blocker for v1** | v1 cannot ship without the spec. Implementation blocked by the spec. |
| **T2 — Required for v1** | v1 ships incomplete without it; implementation can begin on T1 without it but must not complete. |
| **T3 — v1 polish** | Needed before GA; not blocking ticket breakdown. |
| **T4 — Deferred to v1.x** | Acknowledged; tracked; not in v1 scope. |

---

## 3. Spec Plan

Columns: **ID** · **Spec** · **Tier** · **Depends on (PRD / ADR / R## / G##)** · **Coordinates with** · **Flow skeleton?** · **Status**

| ID | Spec | Tier | Depends on | Coordinates with | Flow? | Status |
|---|---|---|---|---|---|---|
| UX-001 | **First-run / folder setup** — pick or create OneDrive folder, detect state, become admin, generate device keys, R20 security-posture acknowledgment | T1 | PRD-001-onboarding (Link), R20, CS §4, G1, UX-R3 | Link, Mouse, Switch (R20 copy) | ✅ [flow-001](./flows/flow-001-first-run-setup.md) | **Skeleton drafted** |
| UX-002 | **Device enrollment (requestor side + admin approver side)** — pending state, 6-char visual code, out-of-band compare, approve/reject, post-approval unlock | T1 | PRD-001-onboarding, CS §5, R4, G2, G9, UX-R1 | Switch (code semantics), Mouse (admin-only affordance), Link | ✅ [flow-002](./flows/flow-002-device-enrollment.md) | **Skeleton drafted** |
| UX-003 | **Movements — date-range-gated load** — empty-by-default, presets + custom, summary strip, filters, bulk actions, status badges | T1 | PRD-002-movements (Link), decisions 2026-04-19 (starts empty), G5, UX-R4 | Mouse (range picker), Morpheus (query shape), Link | ✅ [flow-003](./flows/flow-003-movements-date-range.md) | **Skeleton drafted** |
| UX-004 | **App shell + navigation** — topbar (sync indicator slot, search, settings), sidebar, user strip (desktop-model identity, NOT auth), placeholder screens | T1 | ADR-001 accepted, G1, G3, divergence table row "Authentication" | Mouse, Link | — | Not started |
| UX-005 | **Sync / last-synced status surface** — states (up-to-date, syncing, offline, sync-lag, error), in-topbar and detail-on-click | T1 | G3, Risk OneDrive-latency | Mouse, Neo (signal availability) | — | Not started |
| UX-006 | **New transaction entry** — form surface (inline or modal), "Save & New" fast path, ES+EN labels, validation, category/subcategory picker, tags, status default | T1 | PRD-002-movements, vision §5 speed target, G5 | Link, Mouse, Morpheus (event shape) | — | Not started |
| UX-007 | **Panel (Dashboard)** — accounts, KPIs, 12-month chart, recent tx, empty state for new NGO | T2 | PRD-002-movements, G6 | Mouse, Link | — | Not started |
| UX-008 | **Saldo (Balance / YoY)** — KPI strip, monthly net chart, category comparison, empty state | T2 | PRD-002-movements, G6 | Mouse, Link | — | Not started |
| UX-009 | **Error states / error copy catalog** — crypto failures (G4): bad AAD, chain break, escrow signature bad, wrong DEK version, wipe-and-restore-from-snapshot flow; plus generic I/O, OneDrive unavailable, update signature failed | T1 | R5, R8, R13.1, CS §2.1, §3, §8, G4, UX principle 3 | Switch (technical accuracy), Mouse (severity visual treatment) | — | Not started |
| UX-010 | **Empty states catalog** — first-run (no accounts yet), no tx in range, all filters returned nothing, new NGO across every screen | T2 | G6 | Mouse, Link | — | Not started |
| UX-011 | **Settings / Configuración** — information architecture (general, folder, security, language, diagnostics); folder re-link; wipe local data; device name; show enrollment code | T2 | G12, R6, CS §3.1 | Mouse, Switch (security-sensitive copy) | — | Not started |
| UX-012 | **Admin actions surface** — device revocation, admin transfer, DEK rotation (on-demand), visible admin-only affordances pattern | T2 | CS §3.3, §6, §7, R4, G9 | Switch (confirm copy), Mouse | — | Not started |
| UX-013 | **Audit log viewer** — timeline, filters (actor/action/target/period), security-relevant default view, export to decrypted JSON bundle | T2 | R8, CS §8.3, G8, UX-R5 | Switch (export payload), Mouse | — | Not started |
| UX-014 | **Categories, Subcategories, Tags management** — CRUD, in-line edits, bulk recategorize | T2 | PRD-002-movements (likely scope), cloud feature parity | Mouse, Link | — | Not started |
| UX-015 | **Accounts management** — CRUD, per-account color, IBAN display, archive | T2 | vision §5 | Mouse, Link | — | Not started |
| UX-016 | **CSV import wizard** — select file, column-mapping, dedup preview, commit, R17 safe-parsing edge cases | T2 | PRD-003-import-export (Link), R17, vision §5 | Link, Mouse, Morpheus | — | Not started |
| UX-017 | **Export center** — period + format picker, progress indicator, file location output | T3 | PRD-003-import-export, vision §5 | Link, Mouse | — | Not started |
| UX-018 | **Offline & sync-conflict UX** — offline copy, queued-changes signal, conflict banner for pathological cases | T2 | Principle 5, Risk | Mouse, Neo | — | Not started |
| UX-019 | **Install-time guidance (AR9 SmartScreen)** — pre-install web guide + first-run acknowledgment of unsigned build | T2 | AR9, R20, UX-R3 | DevRel (guide), Switch (copy) | — | Not started |
| UX-020 | **Update flow** — "update available", "verifying signature", "installing, restart required", signature-failure error (R13.1) | T2 | R13.1, G4 | Switch, Mouse | — | Not started |
| UX-021 | **Accessibility baseline** — keyboard nav, focus order, ARIA roles/labels, shortcut map, contrast requirements handoff to Mouse | T2 | G10, vision principle "Treasurer-first" | Mouse (visuals), everyone (applies to all screens) | — | Not started |
| UX-022 | **i18n (ES + EN)** — locale switcher, date/currency/number formatting, per-screen string extraction | T2 or T4 depending on Q6 | vision Q6, G11 | Link (confirms scope), Mouse | — | Not started |
| UX-023 | **Multi-user awareness (minimum)** — "new activity since last view" badge on Movements; optional "recent actor" column | T3 / T4 | G7 | Neo (event-log query), Mouse | — | Not started |
| UX-024 | **Members view (folder-ACL ↔ escrow drift detection)** — side-by-side list, banners on drift, remediation CTAs | T2 | UX-R2, R7, CS §3 | Switch, Mouse, Link | — | Not started |
| UX-025 | **Notifications** — OS-level (enrollment request, device revoked, update installed), in-app banners, quiet/verbose preference | T3 | Divergence-table "Notifications" | Mouse, Link | — | Not started |
| UX-026 | **Reports (cloud parity)** | T4 | vision feature map "Reports (v1.x)" | Link, Mouse | — | Deferred to v1.x |
| UX-027 | **Attachments (receipts)** | T4 | vision "Attachments (v1.x)" | Switch (storage shape), Mouse | — | Deferred to v1.x |
| UX-028 | **Recurring transactions** | T4 | vision "Recurring (v1.x)" | Link, Mouse | — | Deferred to v1.x |

---

## 4. Sequencing — What Gets Specified First

The specs below are ordered to unblock Morpheus/Trinity's ticket breakdown (ADR-001 C1–C15) and to validate the time-to-first-transaction ≤10min metric as early as possible.

### Wave 1 — Blockers for install-to-first-transaction
Must all be at Accepted status before `app/` scaffolding begins beyond skeleton.

1. **UX-004** — App shell (without it, the other screens have no container)
2. **UX-001** — First-run / folder setup (flow-001 skeleton is here; full spec next)
3. **UX-009** — Error states catalog (so every flow below can reference standard error treatments)
4. **UX-003** — Movements date-range gate (flow-003 skeleton is here; full spec next)
5. **UX-006** — New transaction entry (the first treasurer-facing outcome; closes the ≤10min loop)

### Wave 2 — Blockers for multi-device operation
Before the second laptop can ever open the folder.

6. **UX-002** — Device enrollment (flow-002 skeleton is here; full spec next)
7. **UX-012** — Admin actions (at minimum: approve enrollment, revoke device)
8. **UX-005** — Sync status indicator

### Wave 3 — Required for v1 GA
9. UX-007 Panel · 10. UX-008 Saldo · 11. UX-011 Settings · 12. UX-024 Members drift · 13. UX-013 Audit log · 14. UX-014 Categories/Tags · 15. UX-015 Accounts · 16. UX-016 CSV import · 17. UX-010 Empty states catalog · 18. UX-018 Offline & sync conflict · 19. UX-019 SmartScreen guidance · 20. UX-020 Update flow · 21. UX-021 Accessibility baseline · 22. UX-022 i18n (scope pending Q6)

### Wave 4 — Polish before GA
23. UX-017 Export center · 24. UX-025 Notifications · 25. UX-023 Multi-user "new activity"

---

## 5. Dependencies on Link's PRDs

| Niobe spec | Link PRD | What Niobe needs from Link |
|---|---|---|
| UX-001, UX-002 | PRD-001-onboarding (and any "admin model" PRD) | Whether first-setup wins is user-visible as "you are the first admin" or communicated later; whether enrollment can be self-service-for-now with admin-retroactive approval (recommendation: no, per CS §5 admin must be online) |
| UX-003, UX-006, UX-007, UX-008, UX-014, UX-015 | PRD-002-movements (or PRD-002-core-ledger) | Confirm which of Categories/Tags/Accounts management is v1 vs v1.x; confirm date-range presets; confirm "Save & New" is required path |
| UX-016, UX-017 | PRD-003-import-export | File-type support scope (CSV only vs. OFX/QIF); bank-format dedup semantics; which export formats are v1 |
| UX-013 | (none yet) | Does Link want an explicit "Audit & Transparency" PRD for NGO-auditor use cases? |
| UX-022 | Vision Q6 resolution | ES+EN or ES-only-scaffold |

Niobe drafts T1 UX specs against current assumptions; Link's PRDs refine scope; re-review on PRD acceptance.

---

## 6. Style & Traceability Rules (applies to all UX specs)

Every UX spec Niobe writes MUST:

1. **Open with a Status / Owner / Date / Scope header**, matching this plan and the prototype-analysis doc.
2. **Include a Traceability block** citing: PRD(s), ADR(s), ADR-001 condition IDs (C1–C15), Security requirement IDs (R1–R20), relevant crypto-spec sections, gap IDs from prototype-analysis §4.
3. **Describe user-visible behavior and STATES**, not pixels. Defer visual decisions to Mouse. Defer implementation to Neo / Morpheus / Trinity.
4. **Enumerate empty / loading / error states** for every surface. "Happy path only" is rejected at review.
5. **Include accessibility notes** — keyboard, focus order, ARIA. A flow without keyboard steps is incomplete.
6. **Include open questions at the bottom**, numbered, with suggested owner.
7. **Use Mermaid for sequence / state / flow diagrams**, not ASCII art.
8. **Never specify crypto details** — cite crypto-spec §-numbers. Switch owns the mechanics.

---

## 7. Review Cadence

| Artifact | Reviewers (required) | Approver |
|---|---|---|
| UX flow skeletons (this batch) | Link, Mouse | Pedro (async ack) |
| T1 full specs (UX-001 to UX-006, UX-009) | Link, Mouse, Switch (where security-sensitive), Neo (for shell) | Pedro |
| T2 full specs | Link, Mouse, Switch (where applicable) | Pedro |
| T3 specs | Mouse, Link | Pedro (batched) |

Security-sensitive UX copy (error messages for crypto failures, enrollment language, admin-action confirmations, wipe-local-data) requires Switch sign-off per decisions.md 2026-04-19.

---

## 8. What's NOT in this Plan

- **Visual design tokens, components, typography, iconography, color** — Mouse's domain (`docs/design/`).
- **PRDs or product prioritization** — Link's domain (`docs/product/prds/`).
- **Implementation details** — Neo / Morpheus / Trinity (`docs/specs/`).
- **Crypto mechanics** — Switch (`docs/security/crypto-spec.md`).
- **Install guides, user manuals** — deferred to DevRel / `docs/guides/` when v1 approaches.

---

*End of UX spec plan v1. Three flow skeletons drafted alongside.*
