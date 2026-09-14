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
  // WI-19 — optional user-facing metadata. Always projected to string|null
  // in the read model (events predating WI-19 are backfilled as null).
  readonly reference: string | null;
  readonly details: string | null;
}

// WI-19 — User annotation attached to a Transaction. Hard-delete semantics
// (no soft-delete, no edit-versioning). Ordered by createdAt ASC in reads.
export interface TransactionNote {
  readonly id: string; // ULID
  readonly txId: string; // ULID FK → Transaction.id
  readonly text: string; // Up to 2000 chars
  readonly createdAt: string; // ISO 8601 UTC — creation timestamp, stable across edits
}

// SPEC-023 — Transaction split child. Each split represents one portion of
// the parent transaction's amount, with independent category/comment. Splits
// are grouped by parentTxId in ReadModel.splits.
export interface TransactionSplit {
  readonly splitId: string; // ULID — stable PK
  readonly parentTxId: string; // ULID FK → Transaction.id
  readonly amountCents: number; // Positive EUR cents (e.g. 30000 = €300.00)
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly comment: string | null; // ≤ 500 chars (line-item style)
  readonly sortOrder: number;
}

// WI-23 — The legacy `Account` / `Category` / `Tag` / `Subcategory` entity
// interfaces (populated by the `account.created` / `category.created` /
// `tag.created` event streams) were DELETED. All consumers now read from
// `ConfigAccount` / `ConfigCategory` / `ConfigTag`. `transaction.accountId`
// / `.categoryId` / `.tagIds` continue to reference the ids on the config
// arrays — unchanged on the wire.

export interface ConfigAccount {
  readonly id: string;
  readonly name: string;
  readonly bankName?: string;
  readonly label?: string;
  readonly iban?: string;
  readonly color?: string;
  readonly isPaypal?: boolean;
  readonly currency: 'EUR';
  readonly openingBalance: number;
  // WI-23 — required. Handler-assigned `max(existing.sortOrder)+1` on create.
  readonly sortOrder: number;
  readonly createdAt: string;
  // WI-21 — archive flag. ISO 8601 UTC when set; undefined = active.
  readonly archivedAt?: string;
}

// WI-21 — Subcategory (nested under a ConfigCategory). First-class events
// (SubcategoryCreated/Updated/Archived/Unarchived) carry `parentCategoryId`,
// but the projection inlines them into the parent so UI can render the tree
// in a single list call. Archiving a parent does NOT cascade-archive
// children (per Switch's ruling — explicit act required).
export interface ConfigSubcategory {
  readonly id: string;
  readonly parentCategoryId: string;
  readonly name: string;
  readonly color?: string;
  readonly createdAt: string;
  readonly archivedAt?: string;
}

export interface ConfigCategory {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly kind?: 'income' | 'expense';
  // 2026-09 — Internal-transfer marker (money moved between the org's OWN
  // accounts). Excluded from the report credits/debits tables and reported as
  // a separate net reconciliation line. Absent === false.
  readonly isInternalTransfer?: boolean;
  // WI-23 — required. Handler-assigned.
  readonly sortOrder: number;
  readonly createdAt: string;
  // WI-21 — archive flag + inlined subcategories. `subcategories` defaults
  // to an empty array on any ConfigCategory (backfilled at projection time
  // so downstream consumers never hit `undefined`).
  readonly archivedAt?: string;
  readonly subcategories: readonly ConfigSubcategory[];
}

export interface ConfigTag {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  // WI-23 — required. Handler-assigned.
  readonly sortOrder: number;
  readonly createdAt: string;
  readonly archivedAt?: string;
}

export interface ImportMapping {
  readonly accountId: string;
  readonly dateColumn: string;
  readonly amountColumn: string;
  readonly descriptionColumn: string;
  readonly updatedAt: string;
}

export interface ReadModel {
  readonly transactions: readonly Transaction[];
  readonly configAccounts: readonly ConfigAccount[];
  readonly configCategories: readonly ConfigCategory[];
  readonly configTags: readonly ConfigTag[];
  readonly importMappings: readonly ImportMapping[];
  readonly rowHashes: ReadonlySet<string>;
  // WI-19 — notes grouped by parent transaction id. Ordered by createdAt ASC.
  readonly notes: ReadonlyMap<string, readonly TransactionNote[]>;
  // WI-19 — in-memory "index on reference" (Pedro's approved ask — literal
  // DB index is N/A because persistence is an NDJSON event log). Normalized
  // reference (exact match, case-sensitive) → list of transactions sharing it.
  readonly transactionsByReference: ReadonlyMap<string, readonly Transaction[]>;
  // SPEC-023 — splits grouped by parent transaction id. Key = parentTxId;
  // value = splits array in sortOrder ASC. Entry present only while at least
  // one split exists for the parent. Matches the notes pattern.
  readonly splits: ReadonlyMap<string, readonly TransactionSplit[]>;
  // SPEC-023 — O(1) hasSplits check in query functions (avoids Map.has() at
  // every call-site). Set contains parentTxId values.
  readonly splitParentIds: ReadonlySet<string>;
}
