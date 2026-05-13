# Fenster — Backend Dev — work log

## Learnings

### 2026-05-13 — SPEC-026 legacy-format removal (work items #2 + #4)

**Scope landed:** Collapsed `WorkspaceState='migration'` into `'fresh'` with a
`hadLegacyFile` flag; rewrote dev-seed to write through
`EncryptedMultiDeviceEventLog` using a constant BIP39 dev mnemonic gated
behind `NODE_ENV !== 'production'`.

**Files touched:**
- `app/src/core/workspace/detect.ts` + `detect.test.ts` — drop `'migration'`,
  add `hadLegacyFile: boolean` to `DetectionResult`. Folders with only a
  legacy `events.ndjson` now resolve to `'fresh'` with `hadLegacyFile: true`.
- `app/src/shared/ipc-contracts/workspace.ts` — drop `'migration'` from the
  Zod enum, add optional `hadLegacyFile` to the detect response.
- `app/src/main/ipc/handlers/workspace.ts` — propagate `hadLegacyFile`
  through `handleDetect`.
- `app/src/renderer/App.tsx` — remove `MigrationScreen` import and the
  `workspaceStatus === 'migration'` branch (Trinity owns the file deletion
  + locales cleanup in the follow-up).
- `app/src/main/devSeed/devKey.ts` — new. `DEV_RECOVERY_MNEMONIC` constant
  (canonical BIP39 test vector `abandon abandon … about`) + module-load
  `assertDevEnvironment()` throw if `NODE_ENV === 'production'`.
- `app/src/main/devSeed/seedEncryptedWorkspace.ts` — new. Writes
  `events.key` (recovery wrap via dev mnemonic + safeStorage wrap when
  available) then appends seed events through
  `EncryptedMultiDeviceEventLog`.
- `app/src/main/bootstrap.ts` — replace plaintext dev-seed loop with a
  call to `seedEncryptedDevWorkspace()` gated on an empty folder
  (no events.key, no events-*.ndjson, no events.ndjson) + `shouldSeed()`.
  Uses dynamic imports so the dev-seed module + electron `safeStorage` only
  load when needed.

**Verification (all PASS on the working branch):**
- `npm run typecheck` → 0 errors.
- `npm run lint` → 0 warnings.
- `npm test -- workspace` → 45 tests pass (detect.test.ts +1 new case,
  legacy `migration` case rewritten as fresh+hadLegacyFile=true).
- `npm test -- devSeed` → 4 tests pass (WI-23 replay invariants intact).
- `npm test -- bootstrap` → 31 tests pass.
- Full suite has unrelated flakes in `RecoveryCodeInput.test.tsx` and
  `MovementsScreen.test.tsx` (pre-existing — timeout / async races; not
  caused by these changes).

**Decisions worth remembering:**
- The dev mnemonic is the canonical BIP39 test vector (`abandon × 11 +
  about`). Using a known test vector keeps intent unambiguous to anyone
  grepping the code. Recorded in
  `.squad/decisions/inbox/fenster-no-legacy-format-impl.md`.
- The NODE_ENV guard runs at module load (`assertDevEnvironment()`) — belt
  and braces on top of bundler tree-shaking. Cypher (work item #5) should
  add a build-time assertion that `DEV_RECOVERY_MNEMONIC` is unreachable
  from a packaged build.
- Bootstrap uses **dynamic** imports for `./devSeed/seedEncryptedWorkspace`
  and `electron.safeStorage` so neither shows up in production import
  graphs.

**Coordination note (agent race):**
While I was running the verification test suite, a parallel session for
Morpheus (work item #1 — delete `scripts/migrate-workspace.mjs`) ran in the
same checkout and committed both their work AND my uncommitted working-tree
files into a single commit on `chore/remove-migrate-workspace-script` →
PR #326. I did not create the duplicate `fix/no-legacy-format-bootstrap` PR
the directive requested, because the code is already on PR #326 and a
duplicate would conflict. Reported via
`.squad/decisions/inbox/fenster-no-legacy-format-impl.md`.

**Open follow-ups (for other agents):**
- Trinity — work item #3: delete `MigrationScreen.tsx` + `MigrationScreen.test.tsx`,
  drop the `migration` export from `screens/onboarding/index.ts`, remove the
  `onboarding.migration.*` locale keys, surface `hadLegacyFile` as a one-line
  footer hint in `FreshSetupFlow`.
- Cypher — work item #5: build-time assertion that
  `DEV_RECOVERY_MNEMONIC` is tree-shaken out of production bundles; update
  `devSeed.wi23.test.ts` to load seed events back through the encrypted read
  path.
