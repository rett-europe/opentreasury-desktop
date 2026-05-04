# Release process

This is the OpenTreasury Desktop release runbook. It covers how to cut a
trial installer (e.g. `v0.1.0-trial.1`) and publish it to GitHub Releases.

> **Note:** The `.copilot/skills/release-process` skill is for the Squad CLI
> npm package — different product, different rules. Use **this** document
> for the desktop app.

## TL;DR

```bash
# from a clean main, with checks green
npm version 0.1.0-trial.1 --no-git-tag-version
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.1.0-trial.1"
git tag v0.1.0-trial.1
git push origin main --tags
# → CI builds Windows + Linux installers
# → drops them onto a draft GitHub Release
# → human reviews & publishes
```

## Versioning convention

OpenTreasury uses [SemVer](https://semver.org/spec/v2.0.0.html):

- **Pre-1.0 trial builds:** `0.MINOR.PATCH-trial.N` (e.g. `0.1.0-trial.1`,
  `0.1.0-trial.2`). Use these for friends-and-family installers while we
  are still iterating on the data model.
- **Pre-1.0 stable:** `0.MINOR.PATCH` (e.g. `0.2.0`). Bump minor when the
  feature surface changes meaningfully; bump patch for fixes.
- **1.0.0** when we are confident in the data model and ready for a public
  beta.

Validate before tagging:

```bash
node -p "require('semver').valid('0.1.0-trial.1')"
# Must print the version. If it prints `null`, STOP and fix.
```

## Pre-release checklist

Before tagging, confirm:

1. `main` is green on the CI workflow (`gh run list --branch main --limit 1`).
2. Working tree is clean (`git status` shows no changes).
3. `package.json` and `package-lock.json` agree on the new version.
4. `CHANGELOG.md` has an entry for the version, with a meaningful `### Added`
   / `### Changed` / `### Fixed` summary.
5. The user guides under `docs/guides/` are accurate for what's shipping.
6. You can produce a build locally — `npm run package` succeeds and the
   installer in `out/` launches and opens the dataset successfully.

## Cutting the release

```bash
# 1. Bump version (use --no-git-tag-version; we tag manually below)
npm version 0.1.0-trial.1 --no-git-tag-version

# 2. Update CHANGELOG.md — promote [Unreleased] entries under the new heading

# 3. Commit
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v0.1.0-trial.1"

# 4. Tag and push
git tag v0.1.0-trial.1
git push origin main --tags
```

The push triggers `.github/workflows/release.yml`. It builds installers on
`windows-latest` + `ubuntu-latest`, then attaches them to a **draft**
GitHub Release named after the tag. Auto-generated release notes are
included.

## Publishing the draft

1. Watch the workflow: `gh run watch` or open the Actions tab.
2. Once green: `gh release view v0.1.0-trial.1 --web`.
3. Edit the description — paste the `CHANGELOG.md` section, link the
   user guides if relevant, mention the SmartScreen warning users will see.
4. Click **Publish release**.

Artifacts attached:

- `OpenTreasury Setup *.exe` — Windows NSIS installer (unsigned)
- `OpenTreasury-*.AppImage` — Linux AppImage
- `opentreasury-desktop_*.deb` — Debian/Ubuntu package

## Post-release smoke test

On the release author's machine:

1. Download the `.exe` from the published release page.
2. Run it (click through SmartScreen "More info → Run anyway").
3. Choose a fresh data folder via the onboarding wizard.
4. Import a small CSV.
5. Confirm Saldo and Dashboard render.
6. Quit, re-open — confirm the dataset is hydrated from disk.

If anything fails, file an issue immediately and consider yanking the
release (`gh release delete v0.1.0-trial.1`) before friends start
downloading.

## Known limitations

- **Windows code signing:** not configured (AR9). SmartScreen will warn on
  every install. Acceptable for trial; revisit when we have a budget for
  an EV cert.
- **macOS:** `electron-builder.yml` declares a DMG target so source builds
  succeed, but the release workflow does **not** build for macOS (AR10).
- **Auto-update:** not wired (ADR-001 C12 deferred). Users must download
  new versions manually.
- **AppImage signature verification:** the Ed25519 detached-sig flow from
  ADR-001 C12 is not yet implemented.

## Hotfix flow

For an urgent fix on a published version:

```bash
git checkout -b hotfix/0.1.1-trial.1 v0.1.0-trial.1
# ...patch...
npm version 0.1.1-trial.1 --no-git-tag-version
# update CHANGELOG.md
git commit -am "chore(release): v0.1.1-trial.1"
git tag v0.1.1-trial.1
git push origin hotfix/0.1.1-trial.1 --tags
# raise a PR back to main, merge as usual
```

The tag push is what triggers the build; the branch merge is bookkeeping.
