// Entity types (read-model projections from events)

export interface Transaction {
  readonly id: string; // ULID
  readonly date: string; // YYYY-MM-DD
  readonly type: 'income' | 'expense';
  readonly amount: number; // Always positive
  readonly currency: 'EUR';
  readonly description: string;
  readonly accountId: string; // ULID
  readonly categoryId: string | null; // ULID or null
  readonly subcategoryId: string | null; // ULID or null
  readonly tagIds: readonly string[]; // Array of ULIDs
  readonly status: 'pending' | 'approved';
  readonly createdAt: string; // ISO 8601 UTC
}

export interface Account {
  readonly id: string; // ULID
  readonly bankName: string;
  readonly bankNameShort: string | null;
  readonly accountLabel: string; // Display name
  readonly color: string | null; // Hex color
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string; // ISO 8601 UTC
}

export interface Subcategory {
  readonly id: string; // ULID
  readonly name: string;
  readonly isActive: boolean;
}

export interface Category {
  readonly id: string; // ULID
  readonly name: string;
  readonly description: string | null;
  readonly categoryType: 'income' | 'expense';
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly subcategories: readonly Subcategory[];
  readonly createdAt: string; // ISO 8601 UTC
}

export interface Tag {
  readonly id: string; // ULID
  readonly name: string;
  readonly color: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string; // ISO 8601 UTC
}

export interface ConfigAccount {
  readonly id: string;
  readonly name: string;
  readonly bankName?: string;
  readonly currency: 'EUR';
  readonly openingBalance: number;
  readonly createdAt: string;
}

export interface ConfigCategory {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly createdAt: string;
}

export interface ConfigTag {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
}

export interface ReadModel {
  readonly transactions: readonly Transaction[];
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly tags: readonly Tag[];
  readonly configAccounts: readonly ConfigAccount[];
  readonly configCategories: readonly ConfigCategory[];
  readonly configTags: readonly ConfigTag[];
}
