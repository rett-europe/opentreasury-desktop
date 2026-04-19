import type { DomainEvent } from '../events/schemas';
import type { ReadModel } from './types';

// In-memory read model state
let readModel: ReadModel = {
  transactions: [],
  accounts: [],
  categories: [],
  tags: [],
};

// Reducer: fold events into read model
export function applyEvent(event: DomainEvent): void {
  switch (event.type) {
    case 'tx.created':
      readModel = {
        ...readModel,
        transactions: [
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
          },
        ],
      };
      break;

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
  }
}

// Replay multiple events (for testing and initialization)
export function replayEvents(events: DomainEvent[]): void {
  readModel = {
    transactions: [],
    accounts: [],
    categories: [],
    tags: [],
  };
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
  readModel = {
    transactions: [],
    accounts: [],
    categories: [],
    tags: [],
  };
}
