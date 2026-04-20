import type { DomainEvent } from '../events/schemas';
import type {
  ConfigAccount,
  ConfigCategory,
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
        createdAt: event.createdAt,
        ...(event.color !== undefined ? { color: event.color } : {}),
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
      };
      readModel = {
        ...readModel,
        configTags: [...readModel.configTags, next],
      };
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
