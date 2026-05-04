# Changelog

All notable changes to OpenTreasury Desktop are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
