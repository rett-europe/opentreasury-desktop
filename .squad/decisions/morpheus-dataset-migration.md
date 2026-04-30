# Dataset Migration Policy (P1-2 dataDir Switching)

**Date:** 2026-05-04  
**Author:** Morpheus  
**Status:** Decided  
**Context:** PR #194 (ESM + hydration fix)

## Decision

When the user switches `dataDir` to a new location (via Preferences > Dataset), **existing events do NOT automatically migrate**. The new folder becomes a fresh, empty dataset. The old events remain in the previous folder, accessible only by switching `dataDir` back.

This is a **manual switch, not a migration**. Each `dataDir` path is a separate workspace.

## Rationale

### Why NOT auto-copy events on switch?

1. **Data integrity risk:** Copying events.ndjson mid-operation could corrupt data if writes are in-flight.
2. **OneDrive sync conflicts:** Auto-copy to a cloud-synced folder could trigger merge conflicts.
3. **User intent ambiguity:** User might want to start fresh (e.g., separate personal/corporate datasets) rather than move existing data.
4. **Simplicity:** Auto-migration adds complexity, failure modes, and undo requirements.

### Why this is the right tradeoff

- **Trial posture (P1-2 context):** Pedro is switching from local `my-data` to corporate OneDrive `Treasurer` folder. This is a one-time corporate compliance switch, not a recurring workflow. The old dataset (3252 events) is dev/test data, not production.
- **Safety first:** Better to have two separate datasets than risk data loss from a failed copy.
- **Explicit > implicit:** User switching folders likely understands they're changing storage locations. The UI should clarify this is a switch, not a migration.

## Implementation

### Current behavior (already implemented)

- `dataDir` is stored in `userData/app-config.json`
- When changed, the app writes `previousDataDir` for fallback (PR #192 auto-recovery)
- On next launch, bootstrap:
  1. Tries to use the new `dataDir`
  2. If that folder is inaccessible (permissions, OneDrive sync lock, etc.), falls back to `previousDataDir` and reverts the config
  3. Loads events from whichever folder succeeded

### What's fixed in PR #194

**Problem:** The fallback mechanism was silent. User saw:
```
[bootstrap] loaded app config (dataDir: C:\...\Treasurer, readOnly: false)
[bootstrap] hydrated 3252 events from C:\...\my-data
```

The config said "Treasurer" but hydration used "my-data". This looked like a bug but was actually auto-recovery kicking in because the OneDrive folder write failed.

**Fix:** Added explicit logging:
```
[bootstrap] resolved event log directory: <actual-path>
```

Now it's clear which folder is actually in use.

### UX implications (for Trinity/Niobe future work)

When the user switches `dataDir` in Preferences:
- **If new folder is empty:** Show a warning: "Switching to this folder will start a new empty dataset. Your current {X} events will remain in the previous folder. Switch back to access them."
- **If new folder has events:** Allow switch (existing dataset-switching use case).
- **If switch fails (permissions, etc.):** Show error dialog explaining fallback to previous folder.

This is NOT in scope for PR #194 (backend fix). Tracked as future UX refinement.

## Alternatives considered

### (a) Auto-copy events.ndjson on switch

**Pros:** Seamless migration. User doesn't lose data.

**Cons:**
- Adds complexity: What if copy fails mid-way? What if new folder already has events?
- OneDrive sync risk: Copying to a syncing folder could corrupt data.
- Doesn't match trial use case: Pedro wants to switch to corporate OneDrive, not migrate his dev data there.

**Rejected:** Too much risk for too little benefit in the trial context.

### (c) Block switch if new folder is empty AND old has events

**Pros:** Prevents accidental data loss.

**Cons:**
- Prevents legitimate "start fresh" use case (separate personal/corporate datasets).
- User can still delete events manually, so this doesn't fully prevent data loss.

**Rejected:** Too restrictive. The UX warning (see above) is enough.

## References

- PR #192: Auto-recovery fallback (`previousDataDir`)
- PR #193: Trinity's `getEffectiveEventLogDir` comparison fix
- PR #194: ESM import fix + hydration logging
- Issue #149: P1-2 dataset switching spec
