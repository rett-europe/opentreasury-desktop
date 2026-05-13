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

### 2026-05-04 — User Guide Build Pipeline (Issue #264, Branch squad/264-bundle-user-guides)

**Status:** ✅ COMPLETED (coordinated with Morpheus).

**Parts delivered:**
- **Part A (Oracle):** Build script `scripts/build-guides.mjs` that converts markdown guides to self-contained HTML
- **Part D (Oracle):** Release workflow updated to build and upload guides as GitHub release assets
- **Parts B+C (Morpheus):** Help menu + electron-builder bundling (his responsibility)

**Implementation details:**
- Build script (`scripts/build-guides.mjs`):
  - Uses `markdown-it` (added as devDependency) to render markdown
  - Reads `docs/guides/user-guide.md` and `docs/guides/user-guide.es.md`
  - Outputs to `dist-guides/user-guide-en.html` and `dist-guides/user-guide-es.html`
  - Self-contained HTML: all CSS embedded in `<style>` block, all images base64-encoded
  - Header with inlined SVG logo (build/icon.svg resized to 48×48), title, language label
  - Footer with build date and version (from package.json)
  - OpenTreasury brand colors: `#534AB7` (purple) for headings and links
  - Clean typography: sans-serif body, monospace code, generous line-height, 800px max-width container
  - Image resolution: processes markdown image references and base64-embeds PNGs
- Package.json scripts:
  - Added `"build:guides": "node scripts/build-guides.mjs"`
  - Added `"prepackage": "npm run build:guides"` hook to run before electron-builder
- Release workflow (`.github/workflows/release.yml`):
  - Both Windows and Linux jobs run `npm run build:guides` before packaging
  - Linux job uploads `dist-guides/*.html` to GitHub release (alongside .AppImage and .deb)
  - Guides uploaded once per release (not duplicated from Windows job)
- Gitignore: `dist-guides/` added to ignore built artifacts

**Contract with Morpheus (respected):**
- Output paths: `dist-guides/user-guide-en.html` and `dist-guides/user-guide-es.html` (as specified)
- Self-contained: NO external resources, all images base64-embedded, CSS inlined
- Standalone: each file opens correctly with `file://` protocol in any browser
- Morpheus bundled these via `electron-builder.yml` extraResources and added Help menu

**Coordination model:**
- Shared branch: `squad/264-bundle-user-guides`
- No file overlap: Oracle touched scripts/, package.json (scripts + devDeps), .gitignore, .github/workflows/
- Morpheus touched app/src/main/index.ts (Help menu), electron-builder.yml (extraResources)
- Both agents worked in parallel; Morpheus committed the combined work
- Conventional commit message with issue #264 reference and co-author trailer

**Reusable pattern proven:**
- **Markdown → Standalone HTML pipeline** for distributable docs (release guides, offline reference, embedded help)
- Small build script (~210 lines), no complex dependencies (just markdown-it)
- Base64 image embedding eliminates asset path issues in packaged apps
- Build-time rendering (not runtime) keeps app bundle lightweight

**Follow-up potential:**
- Pattern can extend to admin guides, API reference, changelog, security advisories
- Same pipeline works for other locales (French, German, etc.) — just add to guides array
- Could add markdown-it plugins for anchors, ToC, syntax highlighting if needed
- Screenshot references automatically resolve (Cypher's parallel work on doc-shots.spec.ts)

**Testing:**
- Pre-push gates passed: `npm run typecheck && npm run lint && npm run format:check && npm run test`
- Build verified: guides generated correctly, images base64-embedded, self-contained HTML confirmed
- File sizes: ~1.2-1.3MB per guide (includes all screenshots base64-encoded)

### 2026-06-02 — Spanish Translation of End-User Guide (Issue #232, PR in squad/232-spanish-guide)

**Status:** ✅ COMPLETED. `docs/guides/user-guide.es.md` created and pushed.

**File:** `docs/guides/user-guide.es.md` with cross-references to EN version.

**Outcomes:**
- Spanish user guide translated from `user-guide.md` with Castilian Spanish (es-ES) suitable for NGO administrative staff
- All UI labels matched to app i18n keys from `app/src/renderer/locales/es/common.json` for consistency:
  - "Dashboard" → "Panel", "Transactions" → "Movimientos", "Balance" → "Saldo"
  - "Insights" → "Análisis", "Settings" → "Configuración", "Viewer" → "Observador"
  - Action labels like "Save" → "Guardar", "Clear" → "Limpiar" pulled directly from i18n
- Screenshot paths updated to `.es.png` suffix convention (e.g., `01-profile-setup.es.png`) awaiting Cypher's Playwright runs
- Cross-links added: top of ES guide links to EN, top of EN guide links to ES
- Test file `tests/e2e/doc-shots.spec.ts` already parametrized by Cypher for locale control (`DOC_SHOTS_LOCALE` env var)

**Translation approach:**
- Preserved all structure (headings, sections, examples, tips) from EN version
- Kept concrete example names (María, Pablo, Casa Esperanza, CaixaBank) consistent with original
- Maintained technical terms in code blocks (file paths, CLI, `events.ndjson`) unchanged
- Used friendly, patient tone consistent with NGO audience (treasurers, not developers)
- Spanish conventions applied: date format references (DD/MM), currency (€), folder paths (C:\Users\...)

**Coordination notes:**
- Cypher handles screenshot generation in parallel; Oracle references them with `.es.png` suffix before they exist
- Naming convention locked: `{NN}-{slug}.es.png` for Spanish, `{NN}-{slug}.png` for EN (backward-compat)
- Both guides link to each other for discoverability; pattern extends to future locales

**Reusable pattern:** Localized doc translation workflow proven. For future locales:
1. Create `{filename}.{locale-code}.md` parallel to EN version
2. Cross-reference in headers (one line each direction)
3. Extract UI strings from app's i18n JSON files (source of truth)
4. Screenshot paths use `.{locale}.png` suffix
5. Test harness parametrized; screenshot generation triggered by env var

**Follow-up:** Commit on `squad/232-spanish-guide`; Cypher to generate ES screenshots. No PR opened per task instructions — coordinator handles after both agents complete.

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


### 2026-05-12 — SPEC-026 ship gate: Argon2id spec/code drift (Switch verdict)

**Action item for Oracle/Niobe:** docs/specs/026-encryption-at-rest.md §4.1 documents Argon2id 	=3, but shipped code uses 	=4. The persisted rgon2_params in vents.key are correct, so encrypted workspaces in the field are unaffected — **doc-only fix**. Switch flagged as a Medium non-blocking follow-up in PR #321 (SPEC-026 security review). Update the spec to 	=4 (or revert code to 	=3 after a fresh benchmark — Switch is fine either way as long as spec and code agree).

Full context: .squad/decisions/decisions.md § "Decision: SPEC-026 (#306) — Ship Gate Cleared", and .squad/orchestration-log/20260512T185035Z-switch.md.