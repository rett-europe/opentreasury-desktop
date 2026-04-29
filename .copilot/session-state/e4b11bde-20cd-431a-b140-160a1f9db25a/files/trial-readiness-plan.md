# Trial-Readiness Work Plan

**Author:** Neo (Lead/Architect)  
**Date:** 2026-05-05  
**Status:** PROPOSED — awaiting Pedro final sign-off  
**Requested by:** Pedro (perocha)

---

## Executive Summary

This plan decomposes Pedro's 5 accepted decisions into **12 GitHub-issue-sized work items** across **3 phases**. Critical path is **5 items long** (P0-1 → P0-2 → P1-1 → P2-1), spanning ~4-5 days assuming ~1 day/item. Phase 0 and Phase 1 have good parallelization opportunities (3 tracks in P0, 4 tracks in P1).

---

## Phase 0 — Foundations (Day 1)

Unblocking work: schema fields, IPC contracts, profile.json shape. Must complete before Phase 1 begins.

| ID       | Title                                                      | Owner    | Scope                                                                                                                                                                                                                | Files Touched                                                                                             | Acceptance Criteria                                                                                         | Deps |
| -------- | ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| **P0-1** | Add `actorUserId` field to DomainEventBase + IPC contracts | Morpheus | • Add optional `actorUserId?: Ulid` to `DomainEventBase` (nullable for backcompat) • Add `actorIdentitySource: 'local' \| 'aad'` field • Update Zod schemas in `shared/ipc-contracts/*.ts`                           | `app/src/core/events.ts`, `app/src/core/events/schemas.ts`, `app/src/shared/ipc-contracts/transaction.ts` | Events accept new fields; existing events without `actorUserId` replay without error; typecheck + lint pass | —    |
| **P0-2** | Define profile.json schema + load in bootstrap             | Morpheus | • Create `userData/profile.json` schema: `{ name: string, role: 'treasurer'\|'viewer', ngo: string, actorUserId: Ulid, actorIdentitySource: 'local' }` • Load at bootstrap; generate ULID on first launch if missing | `app/src/main/profile.ts` (NEW), `app/src/main/bootstrap.ts`                                              | Profile loads before IPC handlers register; fresh installs get auto-generated file                          | P0-1 |
| **P0-3** | Define app-config.json schema (`dataDir`, `readOnly`)      | Morpheus | • Create `userData/app-config.json`: `{ dataDir?: string, readOnly?: boolean }` • Relax `OT_DATA_DIR` to accept **absolute paths** OR relative subfolder                                                             | `app/src/main/config.ts` (NEW), `app/src/main/bootstrap.ts`                                               | `OT_DATA_DIR=C:\MyNGO\Treasury` works; config persisted across restarts                                     | —    |

### P0 Parallelization

```
P0-1 ──────────────────────┐
                           ├─→ P0-2 (needs actorUserId schema)
P0-3 ──────────────────────┘ (parallel with P0-1)
```

---

## Phase 1 — Core Implementation (Days 2-3)

Main feature work. Depends on P0 completing.

| ID       | Title                                                                    | Owner    | Scope                                                                                                                                                                                                 | Files Touched                                                                    | Acceptance Criteria                                                           | Deps |
| -------- | ------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---- |
| **P1-1** | Replace DATASET_ID/ACTOR_DEVICE_ID constants with profile-sourced values | Morpheus | • Delete `fakeUlid('DEVICE01')` and `fakeUlid('DATASET01')` from `ids.ts` • Wire `transactionDeps.actorDeviceId` + `datasetId` from loaded profile/config • Update `devSeed.ts` to use profile values | `app/src/main/ids.ts`, `app/src/main/ipc/handlers.ts`, `app/src/main/devSeed.ts` | No hardcoded fake ULIDs in production code; events stamped with real actor ID | P0-2 |
| **P1-2** | Implement `app:setDataDir(path)` IPC with validation + relaunch          | Morpheus | • IPC handler validates path exists + writable • Writes to `app-config.json` • Calls `app.relaunch()` + `app.exit()`                                                                                  | `app/src/shared/ipc-contracts/app.ts`, `app/src/main/ipc/handlers.ts`            | Settings change persists; app restarts with new data dir                      | P0-3 |
| **P1-3** | readOnly middleware blocks `eventLog.append`                             | Switch   | • Wrap EventLog with read-only proxy when `config.readOnly === true` • Throw clear error code `WRITE_BLOCKED_READ_ONLY_MODE`                                                                          | `app/src/main/eventLog-readonly-wrapper.ts` (NEW), `app/src/main/bootstrap.ts`   | All write IPC handlers return error in read-only mode; reads work normally    | P0-3 |
| **P1-4** | First-launch profile setup screen (minimal)                              | Trinity  | • Modal on first launch: name + role dropdown + NGO name • "Save & Continue" → writes profile.json, dismiss modal • Skip UX-001 full wizard (deferred)                                                | `app/src/renderer/screens/ProfileSetupModal/` (NEW), `app/src/renderer/App.tsx`  | Fresh install shows modal; filled profile stored; app proceeds to Panel       | P0-2 |
| **P1-5** | Settings row: "Data folder: [path] [Change…]"                            | Trinity  | • Add row to Settings screen with current `dataDir` display • "Change…" button opens folder picker → calls `app:setDataDir` • Banner explains "read-only mode" when set                               | `app/src/renderer/screens/SettingsScreen/`                                       | User can change data folder via Settings; read-only indicator visible         | P1-2 |

### P1 Parallelization

```
P0-2 → P1-1 ────────────────────────┐
                                     │
P0-3 → P1-2 → P1-5                   ├─→ Phase 2
       │                             │
       └─→ P1-3                      │
                                     │
P0-2 → P1-4 ─────────────────────────┘
```

**Four parallel tracks:** (P1-1), (P1-2 → P1-5), (P1-3), (P1-4)

---

## Phase 2 — Polish + Onboarding + Tests (Days 4-5)

Integration, tests, documentation.

| ID       | Title                                             | Owner   | Scope                                                                                                                                          | Files Touched                                                                                            | Acceptance Criteria                                                            | Deps       |
| -------- | ------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| **P2-1** | Update tests for new actor ID pattern             | Cypher  | • Fix all `datasetId: DATASET_ID` references in test files • Add test helper `createTestDeps()` that generates consistent test IDs             | `app/src/core/commands/*.test.ts`, `app/src/main/ipc/handlers/*.test.ts`, `app/src/core/query/*.test.ts` | `npm test` passes (currently ~829 tests); no hardcoded fake ULIDs in test code | P1-1       |
| **P2-2** | readOnly mode e2e test + write-block verification | Cypher  | • E2E test: set `readOnly: true` → verify create-transaction IPC returns error • Verify settings toggle flows                                  | `tests/e2e/readonly-mode.spec.ts` (NEW)                                                                  | E2E confirms writes blocked; Settings flow tested                              | P1-3, P1-5 |
| **P2-3** | Trial onboarding doc (one-writer posture)         | Oracle  | • Document "one active writer per dataset" in `docs/guides/trial-deployment.md` • Steps for treasurer (write) vs co-reviewer (read-only) setup | `docs/guides/trial-deployment.md` (NEW)                                                                  | Doc explains trial posture; links to Settings for data-folder config           | P1-5       |
| **P2-4** | Block OneDrive Personal in Settings folder picker | Trinity | • Reuse UX-001 E1 detection logic • Show rejection card if Personal OneDrive path selected in Settings                                         | `app/src/renderer/screens/SettingsScreen/SettingsScreen.tsx`                                             | Personal OneDrive folder rejected with "not supported in v1" message           | P1-5       |

### P2 Parallelization

```
P1-1 → P2-1
P1-3, P1-5 → P2-2
P1-5 → P2-3
P1-5 → P2-4
```

---

## Critical Path

**Longest dependency chain (5 items):**

```
P0-1 → P0-2 → P1-1 → P2-1 → [done]
       ↓
       P1-4
```

Alternative critical path through storage/readOnly:

```
P0-3 → P1-2 → P1-5 → P2-2 → [done]
       ↓
       P1-3
```

**Both paths are ~5 items long.** Total ETA: 4-5 days with good parallelization.

---

## Risk Assessment

### Risk 1: Existing Events Have No `actorUserId` — Backfill Strategy

**Status:** Needs Pedro decision

**Options:**

1. **"Unknown actor" concession** — old events show as `actorUserId: null` in UI, displayed as "Unknown" or "System". Simple, no migration.
2. **Backfill on profile creation** — when first profile is created, scan existing events, stamp them with the new actor ID. Risks: rewrites log; mixes dev-seed data with real actor.
3. **Ignore pre-trial events** — trial starts with fresh dataset. Pedro manually CSV-exports old demo data if needed.

**Recommendation:** Option 1 (unknown actor). Backfill is complex and dev-seed data isn't real NGO data anyway.

### Risk 2: ID Constants in `ids.ts` — Usage Analysis

**Current usage:**

- `app/src/main/ipc/handlers.ts:213` — imported for `transactionDeps`
- `app/src/main/devSeed.ts:21` — uses its own `fakeUlid('DATASET01')` (duplicate definition!)
- ~50 test files use local `DATASET_ID = ulid('DATA')` pattern (not the constant)

**Impact:** LOW. Only `handlers.ts` imports the constants. Tests define their own. The `devSeed.ts` duplicate should be unified.

### Risk 3: Settings Row vs Full UX-001 Wizard

**Status:** UX-001 spec exists (`docs/ux/specs/ux-001-first-run-setup.md`), fully specced by Niobe.

**Decision:** The full wizard is **deferred**, not discarded. P1-4 implements a **minimal profile modal** (name + role + NGO only). UX-001's folder-picker + R20-checklist + escrow-signing is M2/v1 scope.

**Niobe coordination needed:** Confirm the minimal modal doesn't contradict UX-001 — it's a subset, not a fork.

### Risk 4: readOnly Middleware Scope

**Question:** Does `readOnly` block ALL writes or only domain events?

**Recommendation:** Block `eventLog.append` and `eventLog.appendBatch` only. Settings changes to `app-config.json` must still work (that's how the user exits read-only mode!). Profile.json changes (user name, etc.) are also allowed.

**Switch review required:** Confirm the `readOnly` scope boundary before P1-3 implementation.

### Risk 5: Profile vs Device ID Semantics

**Clarification needed:** Current events have `actorDeviceId` (per-device). Pedro's decision mentions `actorUserId` (per-user). These are different concepts:

- `actorDeviceId` = "which laptop wrote this event" (current field)
- `actorUserId` = "which person wrote this event" (new field)

**Recommendation:** Keep BOTH. `actorDeviceId` stays as-is (generated from profile on first launch, persisted). Add `actorUserId` from profile.json. Both stamp every event. The `actorIdentitySource` field clarifies whether `actorUserId` came from local profile or AAD.

---

## PR Strategy Recommendation

**Ship as small PRs, NOT one large PR per phase.**

Rationale:

1. Pedro just escaped 28-branch hell — small PRs are reviewable.
2. Phase 0 items are independent (P0-1 vs P0-3 can merge separately).
3. Phase 1 items have clear owners (Morpheus vs Trinity vs Switch) — separate PRs avoid cross-owner conflicts.
4. Smaller PRs = faster CI cycles, easier rollback.

**Recommended PR sequence:**

| PR # | Items      | Branch                         | Reviewer                   |
| ---- | ---------- | ------------------------------ | -------------------------- |
| 1    | P0-1       | `feat/event-actoruserid-field` | Switch                     |
| 2    | P0-3       | `feat/app-config-datadir`      | Neo                        |
| 3    | P0-2       | `feat/profile-json-bootstrap`  | Switch, Neo                |
| 4    | P1-1       | `feat/real-actor-ids`          | Neo                        |
| 5    | P1-2       | `feat/setdatadir-ipc`          | Neo                        |
| 6    | P1-3       | `feat/readonly-middleware`     | Switch (author + reviewer) |
| 7    | P1-4       | `feat/profile-setup-modal`     | Mouse, Niobe               |
| 8    | P1-5       | `feat/settings-datadir-row`    | Neo                        |
| 9    | P2-1, P2-2 | `test/trial-readiness`         | Cypher (self-review)       |
| 10   | P2-3       | `docs/trial-deployment-guide`  | Oracle (self-review)       |
| 11   | P2-4       | `feat/settings-onedrive-block` | Neo                        |

**Total: 11 PRs.** Each is small, focused, and has a clear owner. Merges can proceed as items complete — no waiting for entire phases.

---

## Summary Table

| Phase     | Items  | Parallelizable? | ETA         |
| --------- | ------ | --------------- | ----------- |
| P0        | 3      | Yes (2 tracks)  | Day 1       |
| P1        | 5      | Yes (4 tracks)  | Days 2-3    |
| P2        | 4      | Yes (4 tracks)  | Days 4-5    |
| **Total** | **12** | —               | **~5 days** |

---

## Next Steps for Pedro

1. **Decide Risk 1:** Unknown actor concession (recommended) or backfill?
2. **Confirm Risk 4:** readOnly blocks eventLog only, not config writes?
3. **Notify Niobe:** P1-4 is a subset of UX-001, not a replacement.
4. **Create GitHub issues:** Use titles from this plan verbatim.
5. **Assign owners:** Morpheus (P0-1, P0-2, P0-3, P1-1, P1-2), Switch (P1-3), Trinity (P1-4, P1-5, P2-4), Cypher (P2-1, P2-2), Oracle (P2-3).

---

## Appendix: Files Inventory

Files created (NEW):

- `app/src/main/profile.ts`
- `app/src/main/config.ts`
- `app/src/main/eventLog-readonly-wrapper.ts`
- `app/src/shared/ipc-contracts/app.ts` (may exist, needs extension)
- `app/src/renderer/screens/ProfileSetupModal/ProfileSetupModal.tsx`
- `tests/e2e/readonly-mode.spec.ts`
- `docs/guides/trial-deployment.md`

Files modified:

- `app/src/core/events.ts`
- `app/src/core/events/schemas.ts`
- `app/src/shared/ipc-contracts/transaction.ts`
- `app/src/main/bootstrap.ts`
- `app/src/main/ids.ts`
- `app/src/main/ipc/handlers.ts`
- `app/src/main/devSeed.ts`
- `app/src/renderer/App.tsx`
- `app/src/renderer/screens/SettingsScreen/SettingsScreen.tsx`
- ~50 test files (bulk update for ID patterns)

---

_End of plan._
