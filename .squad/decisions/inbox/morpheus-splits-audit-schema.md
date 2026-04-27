# Decision (inbox) — Splits audit log shape (AC13, Wave A)

**Author:** Morpheus · **Issue:** #59 · **Wave:** A · **PR:** squad/59-splits-ipc-register
**Date:** 2026-04-27

## Context

SPEC-023 AC13 calls for an audit log entry per `tx.split` and `tx.split.removed`
operation. Niobe's gap audit asserted that other handlers (e.g.
`transaction.ts` create/update) write to "the audit log" and that split
handlers should mirror them.

**Reality on the ground:** there is no audit module shipped today.
`grep -ri "audit"` across `app/src` returns only documentation
references (`docs/security/crypto-spec.md §8`, `core/audit/` is a
yet-to-exist folder, `events.ts:5` carries a TODO(C10, R8) for the
future). Neither `transaction.ts` nor any other handler appends an
audit entry. Niobe's claim was a misread.

So "mirror exactly" was not a literal option. Two choices:

1. Defer AC13 until the proper crypto-spec §8 audit chain lands.
2. Ship a lightweight, structured `console.info('[audit] …')` line per
   successful split mutation, matching the existing `[bootstrap]`
   logging style (`bootstrap.ts:106,109,120`). Cheap, observable today,
   trivially upgradable to a real audit-chain append once §8 lands.

## Decision

**Ship option 2.** Single-line, pipe-friendly, key=value structured
`console.info('[audit] …')` from inside the split handlers, emitted
**only** after a successful append to the event log (i.e. after the
log grew — replays/dedupes do not emit a second entry).

## Schema

```
[audit] split.created  eventId=<ulid> parentTxId=<ulid> splitCount=<int> totalCents=<int> at=<iso>
[audit] split.removed  eventId=<ulid> parentTxId=<ulid> allRemoved=<bool> removedSplitCount=<int> at=<iso>
```

Field choices:

- `eventId` — links the audit line to the underlying NDJSON event.
- `parentTxId` — required by spec.
- `splitCount` / `totalCents` — captures the "what changed" without
  dumping every child row (PII-light, log-greppable).
- `allRemoved` / `removedSplitCount` — distinguishes the idempotent
  no-op case (`allRemoved=false, removedSplitCount=0`) from a real
  revert, so SPEC-023 AC7 telemetry is observable from logs alone.

## Out of scope (explicit non-goals)

- No new `core/audit/` module, no Ed25519 hash chain, no persistent
  audit file. That is C10/R8 work tracked under crypto-spec §8 and
  belongs to Switch's future audit milestone.
- No retroactive audit entries for `transaction:create/update/delete`
  or notes — those handlers also have no audit calls today; aligning
  them is a separate cross-cutting effort and out of scope for #59.
- No structured logger introduction (`pino`, `winston`, etc). One log
  line, one prefix; trivial to refactor when the audit module lands.

## Migration path

When `core/audit/` lands:

1. Replace the two `console.info('[audit] …')` calls in
   `app/src/main/ipc/handlers/transaction-splits.ts` with the proper
   audit chain append (same fields, persisted record).
2. Apply the same pattern to `transaction.ts`, `notes.ts`, etc., in
   one pass — at that point all handlers cross over together.

## Asks for Pedro

- ✅ / ❌ on the `[audit] split.{created,removed}` line shape.
- Confirm AC13 may be considered satisfied by this lightweight
  approach for v1, with the proper audit chain tracked separately.
