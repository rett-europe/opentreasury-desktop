# Changelog

All notable changes to OpenTreasury Desktop are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
