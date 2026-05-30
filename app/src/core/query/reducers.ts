import type { DomainEvent } from '../events/schemas';
import type {
  ConfigAccount,
  ConfigCategory,
  ConfigSubcategory,
  ConfigTag,
  ReadModel,
  Transaction,
  TransactionNote,
  TransactionSplit,
} from './types';

// Internal mutable state — kept in sync with readModel for O(1) tx append /
// index update. These are the exact same objects exposed via ReadModel
// (cast to readonly) so callers always see the latest snapshot via
// getReadModel() without copies.
let _txList: Transaction[] = [];
let _txByRef: Map<string, Transaction[]> = new Map();

// In-memory read model state. WI-23 collapsed the duplicate legacy
// account/category/tag projections; the perf rewrite (PR #45) keeps a
// mutable `_txList` + reference index so tx.created / tx.updated /
// tx.deleted are O(1) per event.
const emptyReadModel = (): ReadModel => {
  _txList = [];
  _txByRef = new Map();
  return {
    transactions: _txList as readonly Transaction[],
    configAccounts: [],
    configCategories: [],
    configTags: [],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: _txByRef as ReadonlyMap<string, readonly Transaction[]>,
    splits: new Map(),
    splitParentIds: new Set(),
  };
};

let readModel: ReadModel = emptyReadModel();

// WI-19 — incremental reference index helpers (O(1) per event).
// Exact-match, case-sensitive; null refs are skipped so the index only
// contains user-supplied references.

// Add one transaction to the reference index.
function addToRefIndex(tx: Transaction): void {
  if (tx.reference === null) return;
  const bucket = _txByRef.get(tx.reference);
  if (bucket) bucket.push(tx);
  else _txByRef.set(tx.reference, [tx]);
}

// Remove one transaction from its reference bucket.
// O(bucket size) which is negligibly small in practice.
function removeFromRefIndex(txId: string, reference: string | null): void {
  if (reference === null) return;
  const bucket = _txByRef.get(reference);
  if (!bucket) return;
  const next = bucket.filter((t) => t.id !== txId);
  if (next.length === 0) _txByRef.delete(reference);
  else _txByRef.set(reference, next);
}

// Reducer: fold events into read model
export function applyEvent(event: DomainEvent): void {
  switch (event.type) {
    case 'tx.created': {
      const newTx: Transaction = {
        id: event.payload.id,
        date: event.payload.date,
        type: event.payload.type,
        amount: event.payload.amount,
        currency: event.payload.currency,
        description: event.payload.description,
        accountId: event.payload.accountId,
        categoryId: event.payload.categoryId,
        subcategoryId: event.payload.subcategoryId,
        tagIds: event.payload.tagIds,
        status: event.payload.status,
        createdAt: event.payload.createdAt,
        // WI-19 — backfill undefined → null for pre-WI-19 events.
        reference: event.payload.reference ?? null,
        details: event.payload.details ?? null,
      };
      _txList.push(newTx);
      addToRefIndex(newTx);
      readModel = {
        ...readModel,
        transactions: _txList as readonly Transaction[],
        transactionsByReference: _txByRef as ReadonlyMap<string, readonly Transaction[]>,
      };
      break;
    }

    case 'account.created':
    case 'category.created':
    case 'tag.created': {
      // WI-23 — legacy event types are no longer accepted. The boot-guard
      // in JsonFileEventLog.load() refuses logs containing these events;
      // this reducer branch exists only so the discriminated-union type
      // check in the switch stays exhaustive for any stale in-memory
      // `DomainEvent` instance the compiler has not been told about.
      // Runtime reachability is zero in a well-formed app.
      break;
    }

    case 'AccountCreated': {
      const next: ConfigAccount = {
        id: event.id,
        name: event.name,
        currency: event.currency,
        openingBalance: event.openingBalance,
        sortOrder: event.sortOrder,
        createdAt: event.createdAt,
        ...(event.bankName !== undefined ? { bankName: event.bankName } : {}),
        ...(event.label !== undefined ? { label: event.label } : {}),
        ...(event.iban !== undefined ? { iban: event.iban } : {}),
        ...(event.color !== undefined ? { color: event.color } : {}),
        ...(event.isPaypal !== undefined ? { isPaypal: event.isPaypal } : {}),
      };
      readModel = {
        ...readModel,
        configAccounts: [...readModel.configAccounts, next],
      };
      break;
    }

    case 'CategoryCreated': {
      const next: ConfigCategory = {
        id: event.id,
        name: event.name,
        sortOrder: event.sortOrder,
        createdAt: event.createdAt,
        subcategories: [],
        ...(event.color !== undefined ? { color: event.color } : {}),
        ...(event.kind !== undefined ? { kind: event.kind } : {}),
      };
      readModel = {
        ...readModel,
        configCategories: [...readModel.configCategories, next],
      };
      break;
    }

    case 'TagCreated': {
      const next: ConfigTag = {
        id: event.id,
        name: event.name,
        sortOrder: event.sortOrder,
        createdAt: event.createdAt,
        ...(event.color !== undefined ? { color: event.color } : {}),
      };
      readModel = {
        ...readModel,
        configTags: [...readModel.configTags, next],
      };
      break;
    }

    // ---------------------------------------------------------------------
    // WI-21 — Configuración CRUD (archive-only). Each update/archive event
    // rewrites the matching record in-place; `unarchive` clears archivedAt
    // rather than stamping a value so the read model stays boolean-like.
    // Missing-record events are tolerated silently so replay of an event
    // log that lost its `*Created` somehow still converges.
    // ---------------------------------------------------------------------

    case 'AccountUpdated': {
      const idx = readModel.configAccounts.findIndex((a) => a.id === event.accountId);
      if (idx < 0) break;
      const current = readModel.configAccounts[idx]!;
      const patched: ConfigAccount = {
        ...current,
        ...(event.changes.name !== undefined ? { name: event.changes.name } : {}),
        ...(event.changes.bankName !== undefined ? { bankName: event.changes.bankName } : {}),
        ...(event.changes.label !== undefined ? { label: event.changes.label } : {}),
        ...(event.changes.iban !== undefined ? { iban: event.changes.iban } : {}),
        ...(event.changes.color !== undefined ? { color: event.changes.color } : {}),
        ...(event.changes.isPaypal !== undefined ? { isPaypal: event.changes.isPaypal } : {}),
      };
      const nextAccounts = [...readModel.configAccounts];
      nextAccounts[idx] = patched;
      readModel = { ...readModel, configAccounts: nextAccounts };
      break;
    }

    case 'AccountArchived': {
      const idx = readModel.configAccounts.findIndex((a) => a.id === event.accountId);
      if (idx < 0) break;
      const next = [...readModel.configAccounts];
      next[idx] = { ...next[idx]!, archivedAt: event.archivedAt };
      readModel = { ...readModel, configAccounts: next };
      break;
    }

    case 'AccountUnarchived': {
      const idx = readModel.configAccounts.findIndex((a) => a.id === event.accountId);
      if (idx < 0) break;
      const current = readModel.configAccounts[idx]!;
      // Drop archivedAt by reconstructing without it.
      const { archivedAt: _drop, ...rest } = current;
      void _drop;
      const next = [...readModel.configAccounts];
      next[idx] = rest;
      readModel = { ...readModel, configAccounts: next };
      break;
    }

    case 'CategoryUpdated': {
      const idx = readModel.configCategories.findIndex((c) => c.id === event.categoryId);
      if (idx < 0) break;
      const current = readModel.configCategories[idx]!;
      const patched: ConfigCategory = {
        ...current,
        ...(event.changes.name !== undefined ? { name: event.changes.name } : {}),
        ...(event.changes.color !== undefined ? { color: event.changes.color } : {}),
        ...(event.changes.kind !== undefined ? { kind: event.changes.kind } : {}),
      };
      const next = [...readModel.configCategories];
      next[idx] = patched;
      readModel = { ...readModel, configCategories: next };
      break;
    }

    case 'CategoryArchived': {
      const idx = readModel.configCategories.findIndex((c) => c.id === event.categoryId);
      if (idx < 0) break;
      const next = [...readModel.configCategories];
      next[idx] = { ...next[idx]!, archivedAt: event.archivedAt };
      readModel = { ...readModel, configCategories: next };
      break;
    }

    case 'CategoryUnarchived': {
      const idx = readModel.configCategories.findIndex((c) => c.id === event.categoryId);
      if (idx < 0) break;
      const current = readModel.configCategories[idx]!;
      const { archivedAt: _drop, ...rest } = current;
      void _drop;
      const next = [...readModel.configCategories];
      next[idx] = rest;
      readModel = { ...readModel, configCategories: next };
      break;
    }

    case 'SubcategoryCreated': {
      const parentIdx = readModel.configCategories.findIndex(
        (c) => c.id === event.parentCategoryId,
      );
      if (parentIdx < 0) break;
      const parent = readModel.configCategories[parentIdx]!;
      const sub: ConfigSubcategory = {
        id: event.id,
        parentCategoryId: event.parentCategoryId,
        name: event.name,
        createdAt: event.createdAt,
        ...(event.color !== undefined ? { color: event.color } : {}),
      };
      const nextParent: ConfigCategory = {
        ...parent,
        subcategories: [...parent.subcategories, sub],
      };
      const nextCats = [...readModel.configCategories];
      nextCats[parentIdx] = nextParent;
      readModel = { ...readModel, configCategories: nextCats };
      break;
    }

    case 'SubcategoryUpdated': {
      const parentIdx = readModel.configCategories.findIndex(
        (c) => c.id === event.parentCategoryId,
      );
      if (parentIdx < 0) break;
      const parent = readModel.configCategories[parentIdx]!;
      const subIdx = parent.subcategories.findIndex((s) => s.id === event.subcategoryId);
      if (subIdx < 0) break;
      const current = parent.subcategories[subIdx]!;
      const patched: ConfigSubcategory = {
        ...current,
        ...(event.changes.name !== undefined ? { name: event.changes.name } : {}),
        ...(event.changes.color !== undefined ? { color: event.changes.color } : {}),
      };
      const nextSubs = [...parent.subcategories];
      nextSubs[subIdx] = patched;
      const nextCats = [...readModel.configCategories];
      nextCats[parentIdx] = { ...parent, subcategories: nextSubs };
      readModel = { ...readModel, configCategories: nextCats };
      break;
    }

    case 'SubcategoryArchived': {
      const parentIdx = readModel.configCategories.findIndex(
        (c) => c.id === event.parentCategoryId,
      );
      if (parentIdx < 0) break;
      const parent = readModel.configCategories[parentIdx]!;
      const subIdx = parent.subcategories.findIndex((s) => s.id === event.subcategoryId);
      if (subIdx < 0) break;
      const nextSubs = [...parent.subcategories];
      nextSubs[subIdx] = { ...nextSubs[subIdx]!, archivedAt: event.archivedAt };
      const nextCats = [...readModel.configCategories];
      nextCats[parentIdx] = { ...parent, subcategories: nextSubs };
      readModel = { ...readModel, configCategories: nextCats };
      break;
    }

    case 'SubcategoryUnarchived': {
      const parentIdx = readModel.configCategories.findIndex(
        (c) => c.id === event.parentCategoryId,
      );
      if (parentIdx < 0) break;
      const parent = readModel.configCategories[parentIdx]!;
      const subIdx = parent.subcategories.findIndex((s) => s.id === event.subcategoryId);
      if (subIdx < 0) break;
      const { archivedAt: _drop, ...rest } = parent.subcategories[subIdx]!;
      void _drop;
      const nextSubs = [...parent.subcategories];
      nextSubs[subIdx] = rest;
      const nextCats = [...readModel.configCategories];
      nextCats[parentIdx] = { ...parent, subcategories: nextSubs };
      readModel = { ...readModel, configCategories: nextCats };
      break;
    }

    case 'TagUpdated': {
      const idx = readModel.configTags.findIndex((t) => t.id === event.tagId);
      if (idx < 0) break;
      const current = readModel.configTags[idx]!;
      const patched: ConfigTag = {
        ...current,
        ...(event.changes.name !== undefined ? { name: event.changes.name } : {}),
        ...(event.changes.color !== undefined ? { color: event.changes.color } : {}),
      };
      const next = [...readModel.configTags];
      next[idx] = patched;
      readModel = { ...readModel, configTags: next };
      break;
    }

    case 'TagArchived': {
      const idx = readModel.configTags.findIndex((t) => t.id === event.tagId);
      if (idx < 0) break;
      const next = [...readModel.configTags];
      next[idx] = { ...next[idx]!, archivedAt: event.archivedAt };
      readModel = { ...readModel, configTags: next };
      break;
    }

    case 'TagUnarchived': {
      const idx = readModel.configTags.findIndex((t) => t.id === event.tagId);
      if (idx < 0) break;
      const current = readModel.configTags[idx]!;
      const { archivedAt: _drop, ...rest } = current;
      void _drop;
      const next = [...readModel.configTags];
      next[idx] = rest;
      readModel = { ...readModel, configTags: next };
      break;
    }

    // -----------------------------------------------------------------------
    // Hard-delete events. Handler guarantees usage_count === 0 before
    // appending, so dropping the entity from the read model cannot orphan a
    // transaction reference. If a race did leave a dangling refs, the
    // renderer already shows `—` for unresolved category/subcategory/tag ids
    // (existing fallback). Reducers stay idempotent: missing-id is a no-op.
    // -----------------------------------------------------------------------

    case 'AccountDeleted': {
      const next = readModel.configAccounts.filter((a) => a.id !== event.accountId);
      if (next.length === readModel.configAccounts.length) break;
      readModel = { ...readModel, configAccounts: next };
      break;
    }

    case 'CategoryDeleted': {
      const next = readModel.configCategories.filter((c) => c.id !== event.categoryId);
      if (next.length === readModel.configCategories.length) break;
      readModel = { ...readModel, configCategories: next };
      break;
    }

    case 'SubcategoryDeleted': {
      const parentIdx = readModel.configCategories.findIndex(
        (c) => c.id === event.parentCategoryId,
      );
      if (parentIdx < 0) break;
      const parent = readModel.configCategories[parentIdx]!;
      const nextSubs = parent.subcategories.filter((s) => s.id !== event.subcategoryId);
      if (nextSubs.length === parent.subcategories.length) break;
      const nextCats = [...readModel.configCategories];
      nextCats[parentIdx] = { ...parent, subcategories: nextSubs };
      readModel = { ...readModel, configCategories: nextCats };
      break;
    }

    case 'TagDeleted': {
      const next = readModel.configTags.filter((t) => t.id !== event.tagId);
      if (next.length === readModel.configTags.length) break;
      readModel = { ...readModel, configTags: next };
      break;
    }

    case 'movement.imported': {
      const newTx: Transaction = {
        id: event.id,
        date: event.date,
        type: event.movementType,
        amount: event.amount,
        currency: event.currency,
        description: event.description,
        accountId: event.accountId,
        categoryId: event.categoryId,
        subcategoryId: event.subcategoryId,
        tagIds: event.tagIds,
        status: event.status,
        createdAt: event.createdAt,
        // WI-19 — backfill undefined → null for pre-WI-19 events.
        reference: event.reference ?? null,
        details: event.details ?? null,
      };
      _txList.push(newTx);
      addToRefIndex(newTx);
      readModel = {
        ...readModel,
        transactions: _txList as readonly Transaction[],
        rowHashes: new Set([...readModel.rowHashes, event.rowHash]),
        transactionsByReference: _txByRef as ReadonlyMap<string, readonly Transaction[]>,
      };
      break;
    }

    case 'import.mapping.updated': {
      const existingIndex = readModel.importMappings.findIndex(
        (m) => m.accountId === event.accountId,
      );
      if (existingIndex >= 0) {
        const updated = [...readModel.importMappings];
        updated[existingIndex] = {
          accountId: event.accountId,
          dateColumn: event.dateColumn,
          amountColumn: event.amountColumn,
          descriptionColumn: event.descriptionColumn,
          updatedAt: event.updatedAt,
        };
        readModel = {
          ...readModel,
          importMappings: updated,
        };
      } else {
        readModel = {
          ...readModel,
          importMappings: [
            ...readModel.importMappings,
            {
              accountId: event.accountId,
              dateColumn: event.dateColumn,
              amountColumn: event.amountColumn,
              descriptionColumn: event.descriptionColumn,
              updatedAt: event.updatedAt,
            },
          ],
        };
      }
      break;
    }

    case 'tx.note.added': {
      const note: TransactionNote = {
        id: event.noteId,
        txId: event.txId,
        text: event.text,
        createdAt: event.createdAt,
      };
      const nextNotes = new Map(readModel.notes);
      const current = nextNotes.get(event.txId) ?? [];
      // Append; ordered ASC by createdAt because events replay in insertion order.
      nextNotes.set(event.txId, [...current, note]);
      readModel = { ...readModel, notes: nextNotes };
      break;
    }

    case 'tx.note.edited': {
      const nextNotes = new Map(readModel.notes);
      const current = nextNotes.get(event.txId);
      if (current) {
        const updated = current.map((n) =>
          n.id === event.noteId ? { ...n, text: event.text } : n,
        );
        nextNotes.set(event.txId, updated);
        readModel = { ...readModel, notes: nextNotes };
      }
      break;
    }

    case 'tx.note.deleted': {
      const nextNotes = new Map(readModel.notes);
      const current = nextNotes.get(event.txId);
      if (current) {
        const filtered = current.filter((n) => n.id !== event.noteId);
        if (filtered.length === 0) nextNotes.delete(event.txId);
        else nextNotes.set(event.txId, filtered);
        readModel = { ...readModel, notes: nextNotes };
      }
      break;
    }

    case 'tx.split': {
      // SPEC-023 — populate splits map + splitParentIds set. Idempotent by
      // replacement: subsequent tx.split events for same parentTxId replace
      // the entire splits array (no per-row diffing).
      const rows: TransactionSplit[] = event.splits.map((s) => ({
        splitId: s.splitId,
        parentTxId: event.parentTxId,
        amountCents: s.amountCents,
        categoryId: s.categoryId ?? null,
        subcategoryId: s.subcategoryId ?? null,
        comment: s.comment ?? null,
        sortOrder: s.sortOrder,
      }));
      const nextSplits = new Map(readModel.splits);
      nextSplits.set(event.parentTxId, rows);
      const nextSplitParentIds = new Set(readModel.splitParentIds);
      nextSplitParentIds.add(event.parentTxId);
      readModel = { ...readModel, splits: nextSplits, splitParentIds: nextSplitParentIds };
      break;
    }

    case 'tx.split.removed': {
      // SPEC-023 — clear splits entry and remove from splitParentIds.
      const nextSplits = new Map(readModel.splits);
      nextSplits.delete(event.parentTxId);
      const nextSplitParentIds = new Set(readModel.splitParentIds);
      nextSplitParentIds.delete(event.parentTxId);
      readModel = { ...readModel, splits: nextSplits, splitParentIds: nextSplitParentIds };
      break;
    }

    case 'tx.updated': {
      // Pattern A: Full-replacement payload. Find transaction by id, replace.
      const idx = _txList.findIndex((tx) => tx.id === event.payload.id);
      if (idx >= 0) {
        const oldTx = _txList[idx]!;
        const updatedTx: Transaction = {
          id: event.payload.id,
          date: event.payload.date,
          type: event.payload.type,
          amount: event.payload.amount,
          currency: event.payload.currency,
          description: event.payload.description,
          accountId: event.payload.accountId,
          categoryId: event.payload.categoryId,
          subcategoryId: event.payload.subcategoryId,
          tagIds: event.payload.tagIds,
          status: event.payload.status,
          createdAt: event.payload.createdAt, // Preserve original creation timestamp
          reference: event.payload.reference ?? null,
          details: event.payload.details ?? null,
        };
        // Update the reference index incrementally: remove old ref, add new ref.
        removeFromRefIndex(oldTx.id, oldTx.reference);
        addToRefIndex(updatedTx);
        _txList[idx] = updatedTx;
        readModel = {
          ...readModel,
          transactions: _txList as readonly Transaction[],
          transactionsByReference: _txByRef as ReadonlyMap<string, readonly Transaction[]>,
        };
      }
      break;
    }

    case 'tx.deleted': {
      // Soft-delete: remove transaction from projection
      const delIdx = _txList.findIndex((tx) => tx.id === event.txId);
      if (delIdx >= 0) {
        removeFromRefIndex(_txList[delIdx]!.id, _txList[delIdx]!.reference);
        _txList.splice(delIdx, 1);
      }
      // Also clean up notes for this transaction
      const nextNotes = new Map(readModel.notes);
      nextNotes.delete(event.txId);
      // SPEC-023 FR12 — Clear splits for the deleted transaction
      const nextSplits = new Map(readModel.splits);
      const nextSplitParentIds = new Set(readModel.splitParentIds);
      if (nextSplitParentIds.has(event.txId)) {
        nextSplits.delete(event.txId);
        nextSplitParentIds.delete(event.txId);
      }
      readModel = {
        ...readModel,
        transactions: _txList as readonly Transaction[],
        transactionsByReference: _txByRef as ReadonlyMap<string, readonly Transaction[]>,
        notes: nextNotes,
        splits: nextSplits,
        splitParentIds: nextSplitParentIds,
      };
      break;
    }
  }
}

// Replay multiple events (for testing and initialization)
export function replayEvents(events: DomainEvent[]): void {
  readModel = emptyReadModel();
  for (const event of events) {
    applyEvent(event);
  }
}

// Export read-only access to read model
export function getReadModel(): ReadModel {
  return readModel;
}

// Reset (for testing)
export function resetReadModel(): void {
  readModel = emptyReadModel();
}
