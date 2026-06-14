# Changelog

All notable changes to OpenTreasury Desktop are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-trial.3.18] — Config & taxonomy audit attribution

Builds on the 3.17 Audit & Evidence viewer: account, category, subcategory, and tag changes now record who made them and on which device, so the audit **Historial de cambios** attributes them instead of showing "unknown". Existing trial datasets open normally — no migration.

### Added

- **Actor + device attribution on config/taxonomy events (#388, PR #389).** Creating, editing, archiving, or deleting an account, category, subcategory, or tag now stamps the acting user and device onto the event, so the Audit viewer's **Historial de cambios** shows the real author and device for those rows. Attribution stays honest: events written before this release carry no actor on the wire and continue to render as "unknown (pre-coverage)" — never back-filled or inferred. No change to encryption, signing, or the hash chain.

## [0.1.0-trial.3.17] — SPEC-028 Audit & Evidence viewer (WI-4)

Adds the first user-facing audit surface on top of the 3.15/3.16 audit foundation: a read-only **Auditoría / Audit** screen for internal auditors. Existing trial datasets open normally — no migration.

### Added

- **Audit & Evidence viewer — a read-only `Auditoría` screen (SPEC-028 WI-4, PR #386).** A new sidebar entry (under Datos, after Exportar) opens an audit view that surfaces the last-unlock integrity verdict as a banner (verified / verified-with-unsealed-tail / no-anchors / blocking tamper), per-device "anchored through" chips with external-timestamp state, and two lanes: **Historial de cambios** (event-derived change history — date · actor · device · action · account) and **Registro firmado** (signed, hash-chained audit entries: exports, anchors, timestamp receipts). Supports date-range, account, and device filters. Attribution is honest — events written before the audit log existed, or flat config/import events, render as "unknown" instead of inferring an actor. All decryption, verification, and hashing stay in the main process; the renderer receives only Zod-validated view-models (no plaintext, file paths, or key material cross IPC), and the screen never re-verifies or anchors on navigation — it reflects the verdict captured at unlock.

### Documentation

- **Refreshed the living docs to match shipped features (PR #385).** Added an Export (filtered CSV / Excel) section to the EN + ES user guides, documented the v3.16 "Language & format" settings card and the tamper-evidence behavior, and corrected the product plan / roadmap / README status for the already-shipped Export and audit foundation.

## [0.1.0-trial.3.16] — Audit unlock-lockout hardening + Movements/Insights polish

A bug-fix and hardening release on top of the 3.15 SPEC-028 audit foundation.
No new user-facing screen. Existing trial datasets open normally — no migration.

### Fixed

- **Unlock no longer risks a false lock-out from the first-unlock anchor race
  (#379, PR #381).** On a freshly seeded or upgraded workspace, the on-unlock
  device-anchor and trusted-timestamp side-effects could each concurrently
  create and persist a _different_ audit signing key. The anchor chain ended up
  signed with one key while a different key was on disk, so the _next_ unlock
  failed closed with `key-fingerprint-mismatch` and routed to the 12-word
  recovery prompt — a spurious lock-out with no real tampering. The audit
  signing key is now created in exactly one place (the anchor append/write path,
  under the audit append lock); every verify, preflight, and read path uses
  `allowKeyCreation: false`, and the on-unlock side-effects are serialized so the
  timestamp drain runs only after the anchor resolves. Tamper-detection
  semantics are unchanged; the on-disk format, key derivation, and signatures
  are untouched.
- **Movements & Insights: restored the calm date-range layout and removed the
  double scrollbar (#356 regression, PR #377).** The Movements filter bar and the
  Insights header no longer reflow into a cramped two-row date range, and the
  inner scroll container no longer produces a second vertical scrollbar.
- **Preferences: grouped Language, Date format, and Number format into a single
  “Language & format” card (PR #377).** The three former one-row cards are merged
  into one card with stacked label+select rows; control behavior and ids are
  unchanged.

### Internal

- **De-flaked the main-only e2e perf gate (PR #380, with #378).** The
  `movements-perf` spec now seeds a pristine, isolated workspace per run (every
  launch is a reliable first unlock) instead of reusing one seeded workspace
  across the median's launches, which had made the samples causally dependent and
  intermittently routed the second launch to the recovery prompt. Adds opt-in
  boot-trace instrumentation (`OT_BOOT_TRACE`, inert unless set) and uploads
  failure artifacts. The perf budget and assertions are unchanged.

## [0.1.0-trial.3.15] — SPEC-028 Audit & Evidence (Tier 1+2 foundation)

Lays the cryptographic foundation for tamper-evident audit & evidence
(SPEC-028), shipped as **infrastructure** — there is no new user-facing screen
in this release. The benefit is silent integrity protection: if event-log files
are altered outside the app, your next unlock detects it and routes to recovery
instead of loading corrupted data. Existing trial datasets (from
`0.1.0-trial.3.14` or earlier) open normally and bootstrap their first anchor on
first unlock — no migration step, no lock-out.

This is **tamper-evident + externally timestamped, NOT tamper-proof** (see
crypto-spec §8 / SPEC-028 §8.1). The Audit & Evidence viewer and offline
evidence-bundle export (WI-4) are a later increment.

### Added

- **Event-log frontier anchoring (SPEC-028 WI-2, PR #369).** The app computes a
  per-device frontier snapshot of the event log and appends it to the signed,
  hash-chained `FileAuditLog` as an `audit.anchor` entry (Ed25519-signed,
  MK-encrypted, verify-before-append). `device_head_hash` is taken over the raw
  on-disk NDJSON bytes; anchored event files are never rewritten in place.
- **Fail-closed chain-verify-on-unlock (SPEC-028 WI-3, PR #371).** Every unlock
  verifies the full audit chain plus the latest anchor against freshly recomputed
  per-device prefixes. Genuine tampering (chain break, byte-level edit,
  truncation) fails closed — the workspace does not open and routes to snapshot
  recovery. Legacy datasets with no anchor yet open normally (`no-anchor`); late
  peer events are reported as "not yet anchored", not tamper; sync-lag states
  (key/file not yet downloaded, files mid-write) are classified as
  retry/unavailable, not corruption. Verify is read-only (never creates a signing
  key) and measured at ~70 ms for a 5,000-event dataset.
- **Trusted timestamping of the anchor root (SPEC-028 WI-5, Tier 2, PR #372).**
  An anchor's `event_log_root` can be bound to an external RFC-3161 timestamp,
  written as a separate signed `audit.anchor.timestamped` receipt that never
  mutates the anchor. TSA responses are strict-parsed and verified before any
  receipt is written; malformed/rejected tokens leave the anchor "pending".
  Timestamping runs off the write path, is queued when offline, and never blocks
  unlock or data writes.

### Docs

- **SPEC-029 — Invoice Attachments (Draft, spec only, PR #368).** Feature + UX
  spec for attaching invoices to transactions, stored encrypted at rest. Awaiting
  security/architecture/product review. No implementation in this release.

### Changed

- **Dependencies:** bump `vitest` 3.2.4 → 4.1.0 (dev, PR #373); bump `tmp`
  0.2.5 → 0.2.7 (PR #337).

### Internal

- **CI:** repair the doc-shots e2e date-range selector after the filter-bar
  restructure (PR #374) and raise the `movements-perf` cold-boot setup wait to
  60 s (PR #375), restoring a reliably green `e2e · perf gate` on `main`. Neither
  change touches product code or the 1,500 ms perf budget.

## [0.1.0-trial.3.14] — SPEC-027 Export (CSV/XLSX)

Adds the Export feature: a dedicated, date-range-first Export screen that lets
you export filtered movements to CSV or Excel, with the encrypted dataset never
leaving the main process in plaintext. Implements SPEC-027 end to end. Closes
#352.

### Added

- **Export screen (SPEC-027, PR #352).** New "Export" navbar entry opening a
  full-page `/export` screen. Filters reuse the existing Movements read-model
  query patterns (account, category, subcategory, date range, label) — no
  parallel query pipeline. Mandatory-filter gate (FR23): a date range plus at
  least one additional filter is required before Export is enabled, with an
  accessible hint; v1 caps exports at 100k rows.
- **CSV + Excel output.** CSV uses `;` as the default separator; `.xlsx`
  export via the 13-column set (FR11). Filenames follow the active locale.
- **Streaming main-process pipeline (Morpheus/Switch).** AEAD decryption runs
  in the main process using the already-unlocked master key; the renderer never
  sees plaintext rows or file paths. OS save dialog defaults to Documents and
  hard-blocks (FR14) any destination inside the encrypted workspace
  (`EXPORT_DEST_INSIDE_WORKSPACE`, no "save anyway"); atomic temp-then-rename
  write.
- **Export authorization gate (Option A).** Typed `EXPORTAR`/`EXPORT`
  confirmation; a signed audit entry is written before the first byte;
  rate-limit of 3 exports / 15 min; lockout after 5 mistypes → 5 min cooldown.
  Typed input is never logged. Export failures are recorded both on-chain
  (`result: "failed"`) and to local diagnostics.
- **IPC `export:prepare` / `export:run` channels** with Zod contracts validated
  at the boundary (spec §7), plus `export.csv` / `export.xlsx` added to the
  crypto-spec §8.2 audit `action` enum.

### Changed

- **Export screen styling aligned with app conventions (PR #352).** Filter
  chips adopt an opt-in colored variant matching the account-pill look (entity
  colors for accounts, categories, subcategories inheriting category color, and
  labels); the screen fills the content width and uses the shared page-header
  and font tokens for consistency with the rest of the app.

### Docs

- **SPEC-027 — Export (CSV/XLSX) accepted (In Review → Accepted).** Reviewer-acceptance gate passed after merge to `main` (PR #349). All three gating reviewers approved: Neo (architecture), Switch (security), and Link (product) — each APPROVE-WITH-NITS, no blocking items. The export read-model query reuses the existing Movements query patterns (no parallel pipeline); the Option-A security gate and its 7 conditions, the FR14 encrypted-workspace hard-block, dual failure-audit, and the `export.xlsx` audit-enum addition are all reflected; product scope matches the owner brief and v1 boundaries. SPEC-027 and its paired UX spec (`docs/ux/specs/spec-027-export.md`) are cleared for implementation. Non-blocking nits captured in each spec's §13 Status History.

## [0.1.0-trial.3.8] — SPEC-026 encryption-at-rest wiring

Complete wiring of encrypted event log into production unlock paths and workspace
cold-start fallback. Migrated workspaces with encrypted event logs now load correctly
instead of falling back to blank JSON. Closes #318.

### Fixed

- **Encrypted event log now wired into production unlock paths (SPEC-026, PR #318).** Event log initialization is integrated into cold-start workspace fallback, fresh-setup, JoinFlow, and recovery code unlock paths. Migrated workspaces with `events.key` + `events-{deviceId}.ndjson` now load correctly instead of falling back to a blank JSON log.
- **Lazy data IPC handler registration — handlers now registered after workspace unlock (PR #318).** Handlers are registered after workspace unlock instead of at bootstrap, eliminating the race where the renderer queried IPC before the encrypted log was installed.
- **Cold-start workspace fallback honors custom `dataDir` location (PR #318).** Uses `getConfiguredDataDir()` to respect `app-config.json` `dataDir` setting when workspace has been moved to a custom location (e.g., OneDrive).
- **electron-builder configured to skip native rebuild (PR #318).** `npmRebuild: false` added to `electron-builder.yml` since prebuilds ship with sodium-native, argon2, and @napi-rs/keyring — rebuilding would fail locally and break packaged builds.

## [0.1.0-trial.3.7] — Edit modal polish & accessibility

Polish and refinement of SPEC-025 status-based edit rules for transactions,
and improved accessibility for transaction edit workflows.

### Fixed

- **Edit modal — Date, Description, Amount, and Account fields now editable
  on Approved transactions by changing status to Pendiente in-modal (SPEC-025,
  PR #296).** Closes #294. Allows accountants to re-open finalized
  transactions when corrections are needed, with automatic recalculation
  of account balances and journal state.
- **Transaction edit modal — chevron Prev/Next navigation between transactions
  in the active list (PR #296).** Users can now navigate the transaction list
  directly from the edit modal without closing and reopening.
- **ImportWizard tests aligned to renderer rewrite from #290 — main CI
  unblocked (PR #296).** Test fixtures updated to match IPC-based file picker
  introduced in trial.3.6.

### Polish

- **Edit-modal lock hints now appear as hover tooltips instead of repeating
  inline text under each locked field (PR #298).** Reduces visual clutter on
  locked fields while preserving full accessibility: screen readers still
  receive the hint via aria-describedby.

## [0.1.0-trial.3.6] — Picker spinner regression — real fix

The trial.3.5 fix (#289) treated the wrong layer. On packaged Windows,
`<input type="file">` programmatic .click() silently fails — the OS
dialog never opens. Replaced the renderer-level file picker with
Electron's main-process `dialog.showOpenDialog` IPC, matching the
folder-picker pattern. Picker is now reliable.

### Fixed

- **Import file picker now actually opens on packaged Windows (#289 follow-up).**
  Replaced hidden `<input type=file>` + programmatic click with main-process
  `dialog.showOpenDialog` IPC. The OS file dialog opens reliably; cancel
  works cleanly via IPC promise resolution; no busy-state machinery needed.

## [0.1.0-trial.3.5] — Trial-tester bug fixes

Quick follow-up release fixing four bugs reported by a trial tester
(thank you, srivasrivas).

### Fixed

- **Account form no longer blanks the screen on IBAN button long-press
  (#275).** A long-press on the IBAN field's reveal button triggered
  the OS credential-manager context menu, which crashed the renderer
  on some Windows configurations. The IBAN field now suppresses the
  context menu, and a top-level error boundary catches any future
  renderer crashes with a Reload recovery UI instead of a blank window.
- **Dashboard no longer shows horizontal scrollbars at default window
  size (#274).** Two transaction-table column min-widths were trimmed
  so the table fits inside a 1280×800 content box without overflow.
- **Import wizard's "Cancel" button now opens a themed confirmation
  dialog (#277).** Replaces the native OS message box with a modal
  that matches the rest of the app.
- **Import wizard's "Pick file" button now shows a loading state while
  the system file dialog is opening (#276).** On Windows with OneDrive
  folders the dialog can take 1-2 seconds to enumerate reparse points;
  the button is now visibly busy during that wait.

### Internal

- e2e perf-seed harness now generates dates through the current month
  and writes both `app-config.json` and `profile.json` to userData so
  the movements-perf and doc-shots gates stay green as the calendar
  rolls forward and on fresh CI runners.

## [0.1.0-trial.3.4] — Insights period selector

Adds a date-range picker to the Insights landing so tagged transactions
outside the current calendar year are no longer invisible.

### Fixed

- **Insights landing now has a period selector.** Previously the landing
  hard-coded its window to `thisYear()`, so any transaction tagged in a
  prior year was excluded — the page reported "0 active tags" even when
  tags clearly had movements. The landing now uses the same
  `DateRangePicker` as the drilldown screen and defaults to **last 12
  months**, which keeps recent activity visible regardless of the
  calendar boundary.

## [0.1.0-trial.3.3] — import wizard "Ignore" fix

Fixes a small but visible glitch in the import-wizard preview header.

### Fixed

- **Import wizard preview no longer shows raw i18n keys.** When a CSV column
  was set to "(Ignore)" in the column-mapping step, the wizard stored an
  empty-string field key in its mapping state. The dry-run preview header
  then rendered the unresolved translation key
  `importWizard.mapColumns.fields.` as a column title. The mapping handler
  now correctly removes ignored columns rather than storing them under an
  empty key.
- **Re-mapping a CSV column no longer leaves stale entries.** Changing a
  source column from one target field to another (e.g. from Category to
  Subcategory) now removes the previous mapping in the same step.

## [0.1.0-trial.3.2] — dev-seed gate fix

Critical fix for trial.3 and trial.3.1 — prevents packaged builds from seeding demo data into empty folders.

### Fixed

- **Packaged builds no longer seed demo data (#trial.3.2).** Fixed a critical
  bug where packaged builds were incorrectly seeding the "Rett Spain" demo
  dataset (~131KB, hardcoded April 2026 timestamps) into every empty data
  folder on first launch. The dev-seed gate was only checking `process.env.NODE_ENV`
  (which is `undefined` in packaged Electron apps) instead of the canonical
  `app.isPackaged` flag. This caused all "folder switch shows old data" reports
  during trial.3 and trial.3.1 testing.

  **Impact:** Existing data folders are unaffected. If you tested trial.3 or
  trial.3.1 with an empty folder, that folder now contains the demo seed and
  should be deleted or cleared if you want a clean start. New empty folders
  will remain empty as intended.

## [0.1.0-trial.3.1] — folder-switch hotfix

Critical hotfix for trial.3 — fixes data folder switching functionality.

### Fixed

- **Folder switch now works correctly (#270).** When switching data folders
  via Preferences → Change Folder, the app now performs a true process restart
  and loads data from the new folder. Previously, the app appeared to restart
  but continued showing data from the old folder due to incomplete process
  termination. This was a perception issue (no data loss), but broke the core
  use case of switching between test/production datasets.

## [0.1.0-trial.3] — user guides + polish

Third trial build adding bundled user guides and post-install polish from
trial.2 feedback. Same install/launch process; not signed.

### Added

- **Bundled user guides (#264).** Help menu now opens English and Spanish
  user guides directly. Self-contained HTML guides also published as Release
  assets for download without installing.

### Fixed

- **Real version in Preferences About (#261).** Preferences → About now shows
  the actual app version instead of `0.0.0`.
- **About dialog audience copy.** Help → About OpenTreasury now correctly
  describes the app as "Open-source treasury management for NGOs"
  (previously said "SMEs").

## [0.1.0-trial.2] — trial polish

Second trial build with post-install fixes from friends-and-family
feedback on trial.1. Same install/launch process as before; not signed.

### Fixed

- **Production data folder isolation (#256).** Packaged installs now
  use `%APPDATA%\OpenTreasury\` instead of sharing the dev userData
  directory. First-run wizard appears as expected on fresh installs.
- **Hidden default Electron menu (#256).** Packaged builds no longer
  show the `File / Edit / View / Window` menu bar; dev builds keep
  it for DevTools shortcuts.

### Added

- **App icon (#257).** White T-with-keyhole on a purple rounded
  container, replacing the default Electron logo. electron-builder
  auto-derives Windows `.ico` and Linux icon sets from
  `build/icon.png`.

## [0.1.0-trial.1] — first trial installer

First distributable build for friends-and-family testing. Not signed; Windows
SmartScreen will warn before launch (click "More info → Run anyway").

### Added

- **Event-sourced core.** Append-only NDJSON event log; in-memory read-model
  rebuilt from events on boot.
- **Onboarding wizard.** First-run flow picks a data folder (defaults to
  Documents) and seeds the dataset.
- **Import wizard.** CSV preview, column mapping with chips, dry-run with
  duplicate / unknown-taxonomy diagnostics, commit step.
- **Movements screen.** Filterable list, bulk actions, split transactions.
- **Saldo screen.** Category × month grid with sub-categories, drill-down,
  responsive layout.
- **Dashboard.** Rolling 90-day truth, KPI cards, top categories.
- **Configuration.** Accounts, categories (with sub-categories), tags,
  imported account aliases.
- **User guide.** English and Spanish (`docs/guides/user-guide.md`,
  `user-guide.es.md`) with embedded screenshots.
- **Dataset compatibility validation.** Detect corrupted / unknown / older /
  newer dataset folders with friendly recovery dialogs and a boot error page.
- **Migration framework.** Sequential v1→v2→v3 walker (no migrations registered
  yet; scaffold only).
- **i18n.** Full English + Spanish coverage of the UI.

### Known limitations

- Windows installer is **unsigned** (SmartScreen warning expected).
- macOS binary not distributed in this milestone (build config exists but no
  signing / notarization).
- No auto-update yet — new builds must be installed manually.
- No Linux AppImage signature verification yet (Ed25519 wiring deferred).

[Unreleased]: https://github.com/rett-europe/opentreasury-desktop/compare/v0.1.0-trial.2...HEAD
[0.1.0-trial.2]: https://github.com/rett-europe/opentreasury-desktop/compare/v0.1.0-trial.1...v0.1.0-trial.2
[0.1.0-trial.1]: https://github.com/rett-europe/opentreasury-desktop/releases/tag/v0.1.0-trial.1
