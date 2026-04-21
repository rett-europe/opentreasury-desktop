# Morpheus — WI-21 Config CRUD: events & IPC surface

**Date:** 2026-04-22
**Author:** Morpheus (Backend/Event-Sourcing)
**Audience:** Trinity (renderer), Pedro (coordinator), Switch (review)
**Scope:** Backend surface for WI-21 (Config CRUD, archive-only per Switch).
**Constraint pinned to:** `.squad/decisions/inbox/switch-wi21-cascade-policy.md`

## TL;DR

- **No** `*.deleted` events. Archive-only per Switch.
- **No** rename of existing events. Old NDJSON logs replay identically.
- Every new mutation event uses `id` = unique event ULID (log dedupe key) and a domain-named field (`accountId` / `categoryId` / `subcategoryId` / `tagId`) for the target entity. `SubcategoryCreated` is the only exception — it follows the WI-15-lite `*Created` convention where `id` IS the entity id.
- `archivedAt?: string (ISO)` optional on every record. `Archived` stamps it. `Unarchived` clears it. No cascade.

## Event catalog (all PascalCase, flat — matching WI-15-lite)

### Accounts

| Event               | Shape                                                             |
| ------------------- | ----------------------------------------------------------------- |
| `AccountCreated`    | unchanged (WI-15-lite)                                            |
| `AccountUpdated`    | `{ id, accountId, changes, updatedAt }`                           |
| `AccountArchived`   | `{ id, accountId, archivedAt }`                                   |
| `AccountUnarchived` | `{ id, accountId, unarchivedAt }`                                 |

`changes` is a non-empty partial: `{ name?, bankName?, label?, iban?, color?, isPaypal? }`. Reducer only applies the supplied keys.

### Categories

| Event                | Shape                                    |
| -------------------- | ---------------------------------------- |
| `CategoryCreated`    | unchanged                                |
| `CategoryUpdated`    | `{ id, categoryId, changes, updatedAt }` |
| `CategoryArchived`   | `{ id, categoryId, archivedAt }`         |
| `CategoryUnarchived` | `{ id, categoryId, unarchivedAt }`       |

`changes` → `{ name?, color?, kind? }`.

### Subcategories *(NEW — promoted to first-class events)*

**Shape decision:** Subcategories get their own first-class events on the NDJSON log (parent-scoped via `parentCategoryId`) but are **inlined on `ConfigCategory.subcategories[]`** in the read model. Rationale:

- Single-fetch tree consumption → renderer calls `categories:list` once and has the full picker tree.
- Events stay append-only and per-subcategory granular (easy audit trail, no parent rewrite on every sub change).
- No new top-level read-model stream required.
- Aligns with Switch's cascade ruling: parent archive does **not** auto-archive subcategories (reducer pins this; WI-21 reducer test `archiving a parent category does NOT cascade-archive subcategories` proves it).

| Event                   | Shape                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `SubcategoryCreated`    | `{ id, parentCategoryId, name, color?, createdAt }` — `id` = entity id     |
| `SubcategoryUpdated`    | `{ id, subcategoryId, parentCategoryId, changes, updatedAt }`               |
| `SubcategoryArchived`   | `{ id, subcategoryId, parentCategoryId, archivedAt }`                       |
| `SubcategoryUnarchived` | `{ id, subcategoryId, parentCategoryId, unarchivedAt }`                     |

Uniqueness of subcategory name is **scoped to the parent** (two parents can each have a "General"). `parentCategoryId` is required on every subcategory event so projection can route without a secondary lookup.

### Tags

| Event           | Shape                               |
| --------------- | ----------------------------------- |
| `TagCreated`    | unchanged                           |
| `TagUpdated`    | `{ id, tagId, changes, updatedAt }` |
| `TagArchived`   | `{ id, tagId, archivedAt }`         |
| `TagUnarchived` | `{ id, tagId, unarchivedAt }`       |

## IPC channels

```
accounts:create       accounts:update       accounts:archive       accounts:unarchive
accounts:list         (?: { includeArchived?: boolean })
categories:create     categories:update     categories:archive     categories:unarchive
categories:list       (?: { includeArchived?: boolean })
subcategories:create  subcategories:update  subcategories:archive  subcategories:unarchive
tags:create           tags:update           tags:archive           tags:unarchive
tags:list             (?: { includeArchived?: boolean })
```

Every mutation returns:

```ts
{ ok: true, event: <the emitted event> }
| { ok: false, error: { code, message, field? } }
```

Error codes (per entity):

- `NAME_EMPTY`, `NAME_DUPLICATE`, `SCHEMA_INVALID`, `INTERNAL` — on all entities.
- `NOT_FOUND` — on update/archive/unarchive of a missing id.
- `ALREADY_ARCHIVED` / `NOT_ARCHIVED` — on invalid lifecycle transitions.
- `PARENT_NOT_FOUND` — subcategory operations only.
- `OPENING_BALANCE_INVALID` — accounts only.

## Preload bridge (renderer surface)

```ts
window.api.accounts.{create,list,update,archive,unarchive}
window.api.categories.{create,list,update,archive,unarchive}
window.api.categories.subcategory.{create,update,archive,unarchive}
window.api.tags.{create,list,update,archive,unarchive}
```

## Active-only selectors

`app/src/main/projections/config.ts` exposes two flavours per entity:

- `select{Accounts,Categories,Tags}` — returns everything, archivedAt verbatim.
- `selectActive{Accounts,Categories,Tags}` — filters archived; **also strips archived subcategories** from otherwise-active categories. Used as the default inside list handlers when `includeArchived !== true`.

## Backward-compat guarantees

- `*Created` event shapes are untouched; all existing NDJSON fixtures replay identically.
- The `DomainEvent` union is **extended**, not rewritten; the reducer's `switch` falls through on unknown `type` (verified by the pre-existing "ignores unknown event types" test).
- `CategoryRecord.subcategories` is optional on the wire (Zod `.optional()`) so Trinity can construct optimistic records without providing an empty array.

## What Trinity needs from me

- All types + Zod schemas are exported from `@/shared/ipc-contracts/{accounts,categories,tags}`.
- Event record shapes (for optimistic updates) match the projection shape 1:1; spread `resp.event` into the list entry plus inject `subcategories: []` when patching a `CategoryCreated`.
- For subcategory rename/archive the handler needs **both** `id` and `parentCategoryId` — Trinity can read `parentCategoryId` from the current projection entry.

## Gates status (as of this drop)

- `typecheck`: ✅ clean
- `lint` (`--max-warnings 0`): ✅ clean
- `vitest` (full suite): ✅ **400 passed / 9 skipped / 0 failed**
- `build`: ✅ clean
- `prettier --check` (my files only): ✅ clean

Renderer files under Trinity's ownership still fail `format:check` in the repo-wide sweep; that's pre-existing WIP outside my scope.
