import type { DomainEvent } from '../events/schemas';
import type {
  Account,
  ConfigAccount,
  ConfigCategory,
  ConfigSubcategory,
  ConfigTag,
  ReadModel,
  Transaction,
  TransactionNote,
} from './types';

// In-memory read model state
const emptyReadModel = (): ReadModel => ({
  transactions: [],
  accounts: [],
  categories: [],
  tags: [],
  configAccounts: [],
  configCategories: [],
  configTags: [],
  importMappings: [],
  rowHashes: new Set(),
  notes: new Map(),
  transactionsByReference: new Map(),
});

let readModel: ReadModel = emptyReadModel();

// WI-19 — maintain the reference → transactions index alongside the main
// transactions list. Exact-match, case-sensitive; trimmed/empty/null refs are
// skipped so the index only contains user-supplied references.
function indexByReference(
  transactions: readonly Transaction[],
): ReadonlyMap<string, readonly Transaction[]> {
  const idx = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    if (tx.reference === null) continue;
    const key = tx.reference;
    const bucket = idx.get(key);
    if (bucket) bucket.push(tx);
    else idx.set(key, [tx]);
  }
  // Freeze the inner arrays into readonly for the outer type.
  return idx as unknown as ReadonlyMap<string, readonly Transaction[]>;
}

// Reducer: fold events into read model
export function applyEvent(event: DomainEvent): void {
  switch (event.type) {
    case 'tx.created': {
      const nextTransactions: readonly Transaction[] = [
        ...readModel.transactions,
        {
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
        },
      ];
      readModel = {
        ...readModel,
        transactions: nextTransactions,
        transactionsByReference: indexByReference(nextTransactions),
      };
      break;
    }

    case 'account.created':
      readModel = {
        ...readModel,
        accounts: [
          ...readModel.accounts,
          {
            id: event.payload.id,
            bankName: event.payload.bankName,
            bankNameShort: event.payload.bankNameShort,
            accountLabel: event.payload.accountLabel,
            color: event.payload.color,
            sortOrder: event.payload.sortOrder,
            isActive: event.payload.isActive,
            createdAt: event.payload.createdAt,
          },
        ],
      };
      break;

    case 'category.created':
      readModel = {
        ...readModel,
        categories: [
          ...readModel.categories,
          {
            id: event.payload.id,
            name: event.payload.name,
            description: event.payload.description,
            categoryType: event.payload.categoryType,
            sortOrder: event.payload.sortOrder,
            isActive: event.payload.isActive,
            subcategories: event.payload.subcategories,
            createdAt: event.payload.createdAt,
          },
        ],
      };
      break;

    case 'tag.created':
      readModel = {
        ...readModel,
        tags: [
          ...readModel.tags,
          {
            id: event.payload.id,
            name: event.payload.name,
            color: event.payload.color,
            sortOrder: event.payload.sortOrder,
            isActive: event.payload.isActive,
            createdAt: event.payload.createdAt,
          },
        ],
      };
      break;

    case 'AccountCreated': {
      const next: ConfigAccount = {
        id: event.id,
        name: event.name,
        currency: event.currency,
        openingBalance: event.openingBalance,
        createdAt: event.createdAt,
        ...(event.bankName !== undefined ? { bankName: event.bankName } : {}),
        ...(event.label !== undefined ? { label: event.label } : {}),
        ...(event.iban !== undefined ? { iban: event.iban } : {}),
        ...(event.color !== undefined ? { color: event.color } : {}),
        ...(event.isPaypal !== undefined ? { isPaypal: event.isPaypal } : {}),
      };
      // Also project into the legacy Account list so downstream consumers
      // that look up accounts by id (movements/panel/edit modal label
      // resolution) find the record. Config and legacy account stores
      // coexist for historical reasons; this keeps them in sync without
      // a broader refactor.
      const legacyAccount: Account = {
        id: event.id,
        bankName: event.bankName ?? event.name,
        bankNameShort: event.name,
        accountLabel: event.label ?? event.name,
        color: event.color ?? null,
        sortOrder: readModel.accounts.length,
        isActive: true,
        createdAt: event.createdAt,
      };
      readModel = {
        ...readModel,
        accounts: [...readModel.accounts, legacyAccount],
        configAccounts: [...readModel.configAccounts, next],
      };
      break;
    }

    case 'CategoryCreated': {
      const next: ConfigCategory = {
        id: event.id,
        name: event.name,
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

    case 'movement.imported': {
      const nextTransactions: readonly Transaction[] = [
        ...readModel.transactions,
        {
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
        },
      ];
      readModel = {
        ...readModel,
        transactions: nextTransactions,
        rowHashes: new Set([...readModel.rowHashes, event.rowHash]),
        transactionsByReference: indexByReference(nextTransactions),
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

    case 'tx.updated': {
      // Pattern A: Full-replacement payload. Find transaction by id, replace.
      const idx = readModel.transactions.findIndex((tx) => tx.id === event.payload.id);
      if (idx >= 0) {
        const nextTransactions = [...readModel.transactions];
        nextTransactions[idx] = {
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
        readModel = {
          ...readModel,
          transactions: nextTransactions,
          transactionsByReference: indexByReference(nextTransactions),
        };
      }
      break;
    }

    case 'tx.deleted': {
      // Soft-delete: remove transaction from projection
      const nextTransactions = readModel.transactions.filter((tx) => tx.id !== event.txId);
      // Also clean up notes for this transaction
      const nextNotes = new Map(readModel.notes);
      nextNotes.delete(event.txId);
      readModel = {
        ...readModel,
        transactions: nextTransactions,
        transactionsByReference: indexByReference(nextTransactions),
        notes: nextNotes,
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
