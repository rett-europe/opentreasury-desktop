# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Key Reference

Documentation needs:
- README with quick-start for desktop app (download, install, run)
- Architecture overview (Electron main/renderer, local DB, IPC)
- User guide for NGO staff (non-technical audience)
- Feature catalog matching cloud version capabilities
- Contributing guide for developers

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-05-01 — Illustrated End-User Guide Complete (Issue #163, PR #230 + #231)

**Status:** ✅ SHIPPED. Guide + 7 screenshots merged to main.

**File:** `docs/guides/user-guide.md` with embedded PNGs from `docs/guides/screenshots/`.

**Outcomes:**
- EN user-guide prose finalized (NGO staff audience: treasurers, auditors, transaction reviewers)
- 7 screenshots (01-profile-setup through 07-settings-data-folder) regenerated at 1800x1100, EN locale
- Screenshots match prose narrative (first-launch → dashboard → saldo → movements → insights → settings)
- Cross-links to trial-deployment.md (admin/setup topics)
- Screenshot naming convention (2-digit section + kebab-case descriptor) established for future illustrated guides

**Coordination model proven:**
- Writers (Oracle) can reference screenshots before they're generated (Cypher's Playwright runs async)
- Agreed naming convention (`01-`, `02-`, etc.) auto-resolves links on merge
- Relative paths (./screenshots/{name}.png) make guides portable

**Follow-up:** Issue #232 filed — ES-language guide variant (blocked by #163, now open for WI-25). Owners: Oracle+Cypher.

**Pattern for team:** Documented in .squad/decisions.md §"Screenshot Naming Convention for Illustrated Guides". Applies to trial-deployment.md updates, admin guide (if visual), developer onboarding (if screenshots needed).

## 2026-04-19 — Team Context Update (from Scribe)
- ADR-001 (Proposed) at `docs/architecture/adr-001-tech-stack.md` — Neo recommends Option A (React+TS, append-only event-sourced JSON, `age` encryption).
- Security Requirements v0.1 at `docs/security/security-requirements-v0.1.md` — Switch: 20 requirements, 15 stack constraints, 8 accepted risks, 6 open questions for Pedro.
- Both are team context now.

### 2026-04-19: Crypto spec v1.0 + ADR-001 Accepted
Crypto spec v1.0 at `docs/security/crypto-spec.md`. Security Requirements bumped to v0.2. ADR-001 Accepted with conditions C1–C15. Every implementation ticket must cite the C1–C15 condition(s) it satisfies.

## 2026-04-19 — Team update (via Scribe)
Roadmap v1 published at docs/product/roadmap-v1.md. PRD plan at docs/product/prd-plan.md. Three PRDs drafted (001 movements, 002 saldo, 003 panel). User-facing docs (onboarding, admin guide, audit log export) should be scoped per milestone.

### 2026-04-19: Docs implications
- Docs are **bilingual (ES + EN) from v1**.
- Pilot NGO is **Rett Spain** (Spanish-first).


---

## 2026-04-29 — Trial Readiness Work (Team Alert from Scribe)

**Status:** Background analysis complete. Pedro has decision pending on three proposals (auth, storage, first-run UX).

Link completed **product framing** for trial user profile (NGO treasurer + 1 co-reviewer), identity model (implicit Graph /me identity, role placeholder), and storage scope (shared OneDrive for Business / SharePoint). Switch completed **security recommendation** ranking three options: Option A (local profile, ~1 day) for trial now, Option B (Graph-derived, M2 dependent) for GA, Option C (full MSAL login) deferred. Morpheus completed **storage configurability spec** — propose relaxing OT_DATA_DIR + app-config.json + IPC + read-only flag; trial posture = one writer per dataset.

All analysis in .squad/decisions/decisions.md under three new sections:
- "Decision: Trial Readiness — Product Framing (Link)"
- "Decision: Trial Identity & Auth — Security Recommendation (Pedro → Switch)"
- "Decision: Trial Configuration — Data-storage location (Pedro → Morpheus)"

**Action:** May touch Trinity (settings UI row for data folder), Niobe (first-run UX specs), Mouse (if visual work needed). Stand by for Pedro go-ahead.

**Files:** Orchestration logs in .squad/orchestration-log/2026-04-29T10-24-31-{link,switch,morpheus}.md. Session log in .squad/log/2026-04-29T10-24-31-trial-readiness-analysis.md.

---

## 2026-04-29 — Trial Deployment Guide (P2-3 Completed)

**Status:** Completed; PR #164 (draft).

**File:** `docs/guides/trial-deployment.md` (1,800 words, 8 sections, NGO-staff audience).

**Scope delivered:**
- **Part 1:** First install & profile setup (Windows 10+, OneDrive/SharePoint prerequisites).
- **Part 2:** Shared data location setup (OneDrive Business vs. Personal distinction explicit; app-config flow conceptual).
- **Part 3:** One-writer rule explained plainly (Maria/Pablo examples; read-only mode toggle; conflict-file recovery).
- **Part 4:** Adding team members (profile per laptop; role setup; auto-detection of read-only).
- **Part 5:** Trial expectations (what's working: movements, saldo, shared data, read-only multi-user; deferred: encryption, role-based perms, SSO, undo, CSV import, splits, mobile).
- **Part 6:** Encryption posture (plain-text in trial; AEAD in v1; security practices for shared folders).
- **Part 7:** Troubleshooting & FAQ (8 Q&As: read-only mode, data location, conflict files, OneDrive Personal, undo/delete, export, performance, platform support, end-of-trial).
- **Part 8:** Getting help (in-app help, email, GitHub issues, feedback).

**Key learnings:**
1. **Concrete examples win.** Maria, Pablo, Sofia names + their roles made the one-writer rule stick. Avoid abstract "user A" / "user B" in NGO docs.
2. **Distinguish OneDrive Personal vs Business early.** The trial enforces Business/SharePoint only; call it out explicitly in prerequisites and folder-picker copy.
3. **Conflict files are not an edge case.** Document the hazard, recovery steps, and prevention workflow upfront (Part 3 + Part 7 FAQ).
4. **Plain-text security posture needs explicit reassurance.** Explain *why* (speed of feedback), what to do (folder access controls), and when it changes (v1 encryption). Transparently defers vs. hides it.
5. **Trial timeline + migration clarity matter.** NGOs need to know this is 4–8 weeks, data stays in their folder, and v1 will have a migration path. Build confidence, not concern.
6. **Reader-first structure.** Parts numbered 1–8; each section has what-you-need, how-to, example, gotchas. No devs-only copy. Bilingual-ready format (EN only for this draft; ES translation is P2-4 work or later).

**Cross-links added:**
- UX-001 first-run spec (profile, folder validation technical details).
- Roadmap v1 (what's deferred).
- Security Requirements v0.1 (R20 checklist, encryption roadmap).
- App Configuration schemas (app-config.json, profile.json internal reference).

**Limitations acknowledged:**
- No screenshots (PDFs/images deferred; would need visual designer review per Mouse/design standards).
- Bilingual split deferred (EN only; ES translation + layout risk mitigation to follow in P2-4 or i18n pass).
- First-run wizard (UX-001 full flow) not covered — trial uses minimal profile modal only.

**Decision made:**
- Tone: Friendly, concrete, patient. No jargon (no "escrow", "crypto", "IPC", "AEAD" in user prose; only in security/technical sections).
- Audience: NGO admins, treasurers, non-technical coordinators. Assume PC/Windows literacy but not technical depth.
- Structure: Single file, not split across multiple pages (single-doc posture for trial phase simplicity).
