# SPEC-026 — End-to-End Manual Test Script

> **Companion to:** `docs/specs/026-encryption-at-rest.md`
> **Issue:** #306 (encryption-#7 ship gate)
> **Owner:** Cypher (QA) · **Last updated:** 2026-05-12
> **Status:** Manual, until Playwright-Electron support lands for the recovery flow.

This script covers the three end-to-end scenarios that the integration-test
suite under `app/src/core/eventLog/__tests__/*` cannot — anything that requires
`Electron.safeStorage`, the renderer onboarding screens, and IPC round-trips
against the real main process. Each scenario maps directly to one or more of
SPEC-026's 19 acceptance criteria.

## Why this is manual

Playwright-Electron can drive the renderer, but `safeStorage` is per-OS-user
and per-machine. Reliably simulating *"safeStorage fails / recovery flow
kicks in"* in CI requires an OS-level mock that is currently out of scope —
the file-level adapter `safeStorageAvailableForTests` toggle would have to
be plumbed through the entire IPC surface and we explicitly do not want a
test backdoor in production code.

The scenarios below are short, scriptable, and run against a packaged build
(`npm run package`) on a clean OS user account. Total time: ~15 minutes.

## Prerequisites

- A clean macOS / Windows account with no existing OpenTreasury config under:
  - **Windows:** `%APPDATA%\opentreasury\`
  - **macOS:** `~/Library/Application Support/opentreasury/`
  - **Linux:** `~/.config/opentreasury/`
- Two devices (or two OS users on one machine) for the multi-device join flow.
- A shared OneDrive / Dropbox / SharePoint folder reachable from both devices.

## Scenario 1 — Fresh setup → restart → silent unlock

**ACs covered:** AC1, AC2, AC3, AC5, AC8, AC16

| Step | Action | Expected |
|------|--------|----------|
| 1 | Launch a freshly-installed OpenTreasury. | First-run onboarding wizard. |
| 2 | Pick a brand-new local folder for the workspace; complete onboarding. | "Save your recovery code" screen displays 12 BIP39 words. |
| 3 | Note the words on paper. Confirm the 3-word challenge. | Dashboard loads (empty state). |
| 4 | Inspect the workspace folder. | `events.key` is present and small (< 4 KiB). `events-{deviceId}.ndjson` may not exist yet (no events written). |
| 5 | Use the app: create one account + one transaction. | `events-{deviceId}.ndjson` now exists. `cat`-ing it shows JSON lines with `{"id":"...","c":"<base64>"}` — no readable account names. |
| 6 | Fully quit OpenTreasury (Cmd+Q / Alt+F4). | No prompt on next launch. |
| 7 | Launch again. | App opens directly to the dashboard. **No** password / recovery prompt. Account and transaction visible. |

**Fail conditions:** any plaintext financial data visible in the file from step 5; a recovery prompt at step 7; an empty dashboard at step 7 with the file from step 5 still on disk.

## Scenario 2 — Multi-device join flow

**ACs covered:** AC4, AC6, AC9, AC10, AC11

Run scenario 1 on **device A** first. Then:

| Step | Action | Expected |
|------|--------|----------|
| 1 | Place the workspace folder on shared cloud sync (OneDrive / SharePoint / Dropbox). Wait for sync to complete on device A. | Both `events.key` and `events-{deviceA}.ndjson` visible in the cloud provider's web UI. |
| 2 | On **device B**, install OpenTreasury fresh. Launch. | First-run wizard. |
| 3 | Choose "Join existing workspace". Point at the synced folder. | App detects existing `events.key`, prompts for the 12-word recovery code. |
| 4 | Enter the recovery code from device A. | Enrollment screen, then dashboard with the account + transaction from device A visible. |
| 5 | Inspect the workspace folder. | Two device files: `events-{deviceA}.ndjson` (from A) and `events-{deviceB}.ndjson` (initially empty — device B has not written yet). `events.key` shows TWO `safeStorage` wraps (device A's + device B's) plus the original recovery wrap. |
| 6 | On device B, create a transaction. Wait for sync. | `events-{deviceB}.ndjson` now contains one encrypted line. |
| 7 | On device A, **restart the app** (the existing process may need to re-glob to pick up the new file). | Device A's dashboard shows both the original transaction and device B's new one. |
| 8 | Check the workspace folder. | Zero `*conflict*` files. No file with parentheses in the name. |

**Fail conditions:** join prompt does not appear at step 3 (the app silently created a new workspace); device A's transactions missing on device B at step 4; any conflict-copy file at step 8.

## Scenario 3 — Recovery from safeStorage failure

**ACs covered:** AC7, AC12, AC13, AC15, AC16

This is the lost-laptop / new-machine scenario.

| Step | Action | Expected |
|------|--------|----------|
| 1 | Complete scenario 1 (or 2). Quit OpenTreasury. | Workspace folder + `events.key` present. |
| 2 | Simulate safeStorage failure: <br>**macOS:** delete OpenTreasury entries from Keychain (`security delete-generic-password -s opentreasury`). <br>**Windows:** delete the `opentreasury` Credential Manager entries. <br>**Linux:** purge the libsecret entry. | safeStorage cannot decrypt the device wrap on next launch. |
| 3 | Launch OpenTreasury. | **Recovery prompt** appears with text "We could not unlock this device automatically. Enter your 12-word recovery code." No silent fallback to a fresh workspace. No crash. |
| 4 | Enter the 12 words from scenario 1. | Workspace unlocks. Dashboard loads with the original data. |
| 5 | Quit and re-launch. | App opens to the dashboard silently (recovery created a fresh `safeStorage` wrap). |
| 6 | Verify on disk: `events.key` was modified at step 4 (mtime newer than step 1). | The MK was re-wrapped to a new device-id under safeStorage. The shared recovery wrap is unchanged. |

**Fail conditions:** the app silently creates a new (empty) workspace at step 3; the recovery prompt accepts a wrong code; step 5 prompts again instead of unlocking silently.

## Scenario 4 — Recovery code typo / wrong words

**ACs covered:** AC12, AC13

| Step | Action | Expected |
|------|--------|----------|
| 1 | Trigger the recovery prompt (Scenario 3 step 3, or fresh install + Join). | Recovery input visible. |
| 2 | Enter 12 valid BIP39 words that are NOT the workspace's code. | Inline error: "These words do not match this workspace. Check your card." No retry-count exposure (deliberate — see threat model §3 "out of scope: coercion"). |
| 3 | Enter a string that is not 12 words / contains non-BIP39 tokens. | Per-field validation: invalid words highlighted before any unlock attempt. |
| 4 | Enter the correct 12 words. | Unlock succeeds. |

**Fail conditions:** any unlock with a wrong code; any crash; any retry counter or "N attempts remaining" UI (out of scope by design — the recovery code is the team secret, not a per-user password).

## Sign-off

Each scenario above should be checked off on a fresh machine (or VM snapshot)
before SPEC-026 ships. Record the build hash and the date in the
`#qa-encryption` channel — that becomes the public artefact of the ship gate.
