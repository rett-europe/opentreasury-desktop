import { z } from 'zod';

// Event envelope schema (all events share this structure)
export const eventEnvelopeSchema = z.object({
  id: z.string().length(26), // ULID
  type: z.string(),
  datasetId: z.string().length(26), // ULID
  actorDeviceId: z.string().length(26), // ULID
  createdAt: z.string().datetime(), // ISO 8601 UTC
  dekVersion: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

// Transaction (Movement) event payloads

export const transactionTypeSchema = z.enum(['income', 'expense']);
export const transactionStatusSchema = z.enum(['pending', 'approved']);

export const transactionCreatedPayloadSchema = z.object({
  id: z.string().length(26), // ULID
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  type: transactionTypeSchema,
  amount: z.number().nonnegative(), // >= 0 — bank exports occasionally include €0 rows. Sign carried by `type`.
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26), // ULID
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: transactionStatusSchema,
  createdAt: z.string().datetime(), // ISO 8601 UTC
  // WI-19 — Optional on the wire for backward compatibility with pre-WI-19
  // events already persisted to the NDJSON log. New events emit string|null.
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
});

export type TransactionCreatedPayload = z.infer<typeof transactionCreatedPayloadSchema>;

export const transactionCreatedEventSchema = eventEnvelopeSchema.extend({
  type: z.literal('tx.created'),
  payload: transactionCreatedPayloadSchema,
});

export type TransactionCreatedEvent = z.infer<typeof transactionCreatedEventSchema>;

// Account event payloads

export const accountCreatedPayloadSchema = z.object({
  id: z.string().length(26), // ULID
  bankName: z.string().max(100),
  bankNameShort: z.string().max(50).nullable(),
  accountLabel: z.string().max(200), // Display name
  color: z.string().max(7).nullable(), // Hex color, validated against palette
  sortOrder: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type AccountCreatedPayload = z.infer<typeof accountCreatedPayloadSchema>;

export const accountCreatedEventSchema = eventEnvelopeSchema.extend({
  type: z.literal('account.created'),
  payload: accountCreatedPayloadSchema,
});

export type AccountCreatedEvent = z.infer<typeof accountCreatedEventSchema>;

// Category event payloads

export const categoryTypeSchema = z.enum(['income', 'expense']);

export const subcategorySchema = z.object({
  id: z.string().length(26), // ULID
  name: z.string().max(100),
  isActive: z.boolean().default(true),
});

export type Subcategory = z.infer<typeof subcategorySchema>;

export const categoryCreatedPayloadSchema = z.object({
  id: z.string().length(26), // ULID
  name: z.string().max(100),
  description: z.string().max(300).nullable(),
  categoryType: categoryTypeSchema,
  sortOrder: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  subcategories: z.array(subcategorySchema).default([]),
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type CategoryCreatedPayload = z.infer<typeof categoryCreatedPayloadSchema>;

export const categoryCreatedEventSchema = eventEnvelopeSchema.extend({
  type: z.literal('category.created'),
  payload: categoryCreatedPayloadSchema,
});

export type CategoryCreatedEvent = z.infer<typeof categoryCreatedEventSchema>;

// Tag event payloads

export const tagCreatedPayloadSchema = z.object({
  id: z.string().length(26), // ULID
  name: z.string().max(100),
  color: z.string().max(20).nullable(),
  sortOrder: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type TagCreatedPayload = z.infer<typeof tagCreatedPayloadSchema>;

export const tagCreatedEventSchema = eventEnvelopeSchema.extend({
  type: z.literal('tag.created'),
  payload: tagCreatedPayloadSchema,
});

export type TagCreatedEvent = z.infer<typeof tagCreatedEventSchema>;

// ---------------------------------------------------------------------------
// WI-15-lite — Configuración events (flat wire-style events, PascalCase type).
// These are stored on the same NDJSON log as the enveloped events above, but
// use a flat structure because the Configuración contract intentionally keeps
// the wire shape minimal (no datasetId/actorDeviceId/dekVersion — deferred to
// M2 along with crypto). The JsonFileEventLog only requires a string `id`
// and the reducer switches on `type`, so both shapes coexist cleanly.
// ---------------------------------------------------------------------------

export const configAccountCreatedEventSchema = z.object({
  type: z.literal('AccountCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().optional(),
  label: z.string().optional(),
  iban: z.string().optional(),
  color: z.string().optional(),
  isPaypal: z.boolean().optional(),
  currency: z.literal('EUR'),
  openingBalance: z.number(),
  // WI-23 — required. Assigned by the handler (max(existing.sortOrder)+1)
  // or by dev-seed. Missing-`sortOrder` events are refused at boot by the
  // JsonFileEventLog loader (see `docs/security/security-requirements-v0.1.md`
  // §"Schema migration policy" — WI-23 Strategy 3 precedent).
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type ConfigAccountCreatedEvent = z.infer<typeof configAccountCreatedEventSchema>;

export const configCategoryCreatedEventSchema = z.object({
  type: z.literal('CategoryCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  // 2026-04-22 — Optional direction (income|expense) added to match the
  // updated Categorías prototype. Optional on the wire so pre-existing
  // NDJSON events replay cleanly.
  kind: z.enum(['income', 'expense']).optional(),
  // WI-23 — required. See configAccountCreatedEventSchema.sortOrder for
  // migration policy; Strategy 3 boot-guard refuses old events lacking it.
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type ConfigCategoryCreatedEvent = z.infer<typeof configCategoryCreatedEventSchema>;

export const configTagCreatedEventSchema = z.object({
  type: z.literal('TagCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  // WI-23 — required. See configAccountCreatedEventSchema.sortOrder.
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type ConfigTagCreatedEvent = z.infer<typeof configTagCreatedEventSchema>;

// ---------------------------------------------------------------------------
// WI-21 — Configuración CRUD (Account / Category / Subcategory / Tag).
// Archive-only per Switch's ruling (.squad/decisions/inbox/
// switch-wi21-cascade-policy.md) — NO hard-delete events in this slice.
// Flat wire shape, PascalCase `type`, to match the existing WI-15-lite
// config stream; renaming the `*Created` events to a dot-notation would
// break backward-compat for any NDJSON log already on disk.
//
// `*Updated` carry a partial `changes` patch. `*Archived` stamp `archivedAt`.
// `*Unarchived` clear the flag (no timestamp needed in the read model).
// Subcategories are first-class on the event log (parent-scoped via
// `parentCategoryId`) but projected inline on `ConfigCategory.subcategories`.
// ---------------------------------------------------------------------------

export const configAccountUpdatedEventSchema = z.object({
  type: z.literal('AccountUpdated'),
  // Unique event ULID. Decouples the event-log dedupe key from the entity
  // id so multiple mutations of the same account produce distinct log
  // entries (the JsonFileEventLog drops duplicate `id`s). Mirrors the
  // `tx.note.added` / `tx.deleted` pattern.
  id: z.string().min(1),
  accountId: z.string().min(1),
  changes: z
    .object({
      name: z.string().min(1).optional(),
      bankName: z.string().optional(),
      label: z.string().optional(),
      iban: z.string().optional(),
      color: z.string().optional(),
      isPaypal: z.boolean().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, { message: 'changes must be non-empty' }),
  updatedAt: z.string().datetime(),
});

export type ConfigAccountUpdatedEvent = z.infer<typeof configAccountUpdatedEventSchema>;

export const configAccountArchivedEventSchema = z.object({
  type: z.literal('AccountArchived'),
  id: z.string().min(1),
  accountId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type ConfigAccountArchivedEvent = z.infer<typeof configAccountArchivedEventSchema>;

export const configAccountUnarchivedEventSchema = z.object({
  type: z.literal('AccountUnarchived'),
  id: z.string().min(1),
  accountId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type ConfigAccountUnarchivedEvent = z.infer<typeof configAccountUnarchivedEventSchema>;

export const configCategoryUpdatedEventSchema = z.object({
  type: z.literal('CategoryUpdated'),
  id: z.string().min(1),
  categoryId: z.string().min(1),
  changes: z
    .object({
      name: z.string().min(1).optional(),
      color: z.string().optional(),
      kind: z.enum(['income', 'expense']).optional(),
    })
    .refine((c) => Object.keys(c).length > 0, { message: 'changes must be non-empty' }),
  updatedAt: z.string().datetime(),
});

export type ConfigCategoryUpdatedEvent = z.infer<typeof configCategoryUpdatedEventSchema>;

export const configCategoryArchivedEventSchema = z.object({
  type: z.literal('CategoryArchived'),
  id: z.string().min(1),
  categoryId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type ConfigCategoryArchivedEvent = z.infer<typeof configCategoryArchivedEventSchema>;

export const configCategoryUnarchivedEventSchema = z.object({
  type: z.literal('CategoryUnarchived'),
  id: z.string().min(1),
  categoryId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type ConfigCategoryUnarchivedEvent = z.infer<typeof configCategoryUnarchivedEventSchema>;

export const configSubcategoryCreatedEventSchema = z.object({
  type: z.literal('SubcategoryCreated'),
  // Matches the WI-15-lite `*Created` convention: `id` IS the entity id
  // (a subcategory is only created once per id — entity-level uniqueness
  // doubles as the log's dedupe guarantee). Subsequent mutations carry a
  // separate event ULID in `id` and keep the entity id under `subcategoryId`.
  id: z.string().min(1),
  parentCategoryId: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type ConfigSubcategoryCreatedEvent = z.infer<typeof configSubcategoryCreatedEventSchema>;

export const configSubcategoryUpdatedEventSchema = z.object({
  type: z.literal('SubcategoryUpdated'),
  id: z.string().min(1),
  subcategoryId: z.string().min(1),
  parentCategoryId: z.string().min(1),
  changes: z
    .object({
      name: z.string().min(1).optional(),
      color: z.string().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, { message: 'changes must be non-empty' }),
  updatedAt: z.string().datetime(),
});

export type ConfigSubcategoryUpdatedEvent = z.infer<typeof configSubcategoryUpdatedEventSchema>;

export const configSubcategoryArchivedEventSchema = z.object({
  type: z.literal('SubcategoryArchived'),
  id: z.string().min(1),
  subcategoryId: z.string().min(1),
  parentCategoryId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type ConfigSubcategoryArchivedEvent = z.infer<typeof configSubcategoryArchivedEventSchema>;

export const configSubcategoryUnarchivedEventSchema = z.object({
  type: z.literal('SubcategoryUnarchived'),
  id: z.string().min(1),
  subcategoryId: z.string().min(1),
  parentCategoryId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type ConfigSubcategoryUnarchivedEvent = z.infer<
  typeof configSubcategoryUnarchivedEventSchema
>;

export const configTagUpdatedEventSchema = z.object({
  type: z.literal('TagUpdated'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  changes: z
    .object({
      name: z.string().min(1).optional(),
      color: z.string().optional(),
    })
    .refine((c) => Object.keys(c).length > 0, { message: 'changes must be non-empty' }),
  updatedAt: z.string().datetime(),
});

export type ConfigTagUpdatedEvent = z.infer<typeof configTagUpdatedEventSchema>;

export const configTagArchivedEventSchema = z.object({
  type: z.literal('TagArchived'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type ConfigTagArchivedEvent = z.infer<typeof configTagArchivedEventSchema>;

export const configTagUnarchivedEventSchema = z.object({
  type: z.literal('TagUnarchived'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type ConfigTagUnarchivedEvent = z.infer<typeof configTagUnarchivedEventSchema>;

// ---------------------------------------------------------------------------
// WI-17 — Import events (flat wire-style events, no envelope).
// Coexist with enveloped and WI-15-lite events on the same NDJSON log.
// ---------------------------------------------------------------------------

export const movementImportedEventSchema = z.object({
  type: z.literal('movement.imported'),
  id: z.string().length(26),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  movementType: z.enum(['income', 'expense']),
  amount: z.number().nonnegative(),
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26),
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: z.enum(['pending', 'approved']),
  createdAt: z.string().datetime(),
  rowHash: z.string().length(16),
  sourceFileName: z.string(),
  importBatchId: z.string().length(26),
  rowIndex: z.number().int().positive(),
  // WI-19 — Optional on the wire for backward compatibility with events
  // written before reference/details columns were mappable in the wizard.
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
});

export type MovementImportedEvent = z.infer<typeof movementImportedEventSchema>;

export const importMappingUpdatedEventSchema = z.object({
  type: z.literal('import.mapping.updated'),
  id: z.string().length(26),
  accountId: z.string().length(26),
  dateColumn: z.string(),
  amountColumn: z.string(),
  descriptionColumn: z.string(),
  updatedAt: z.string().datetime(),
});

export type ImportMappingUpdatedEvent = z.infer<typeof importMappingUpdatedEventSchema>;

// ---------------------------------------------------------------------------
// WI-19 — Transaction notes events (flat wire-style, no envelope).
// Notes are user annotations attached to a Transaction. They live on the same
// append-only NDJSON event log as movements, and — like description/reference/
// details on the parent transaction — their free-text content is considered
// part of the DEK-encrypted payload surface (per ADR-002 / decisions.md, the
// event log transport layer is responsible for encryption at M2 crypto; the
// event payload shape itself does NOT leak plaintext in any new code path).
//
// Three events model the lifecycle:
//   - tx.note.added    (create)
//   - tx.note.edited   (in-place mutation; no version history)
//   - tx.note.deleted  (hard-delete — notes are ephemeral commentary)
// ---------------------------------------------------------------------------

export const transactionNoteAddedEventSchema = z.object({
  type: z.literal('tx.note.added'),
  id: z.string().length(26), // Event ULID (unique per event — the log's dedupe key).
  noteId: z.string().length(26), // Note primary key (stable across edits).
  txId: z.string().length(26),
  text: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
});

export type TransactionNoteAddedEvent = z.infer<typeof transactionNoteAddedEventSchema>;

export const transactionNoteEditedEventSchema = z.object({
  type: z.literal('tx.note.edited'),
  id: z.string().length(26), // Event ULID (unique per edit event).
  noteId: z.string().length(26), // Note being edited.
  txId: z.string().length(26),
  text: z.string().min(1).max(2000),
  editedAt: z.string().datetime(),
});

export type TransactionNoteEditedEvent = z.infer<typeof transactionNoteEditedEventSchema>;

export const transactionNoteDeletedEventSchema = z.object({
  type: z.literal('tx.note.deleted'),
  id: z.string().length(26), // Event ULID (unique per deletion event).
  noteId: z.string().length(26), // Note being deleted.
  txId: z.string().length(26),
  deletedAt: z.string().datetime(),
});

export type TransactionNoteDeletedEvent = z.infer<typeof transactionNoteDeletedEventSchema>;

// ---------------------------------------------------------------------------
// WI-20 — Transaction edit + delete events (enveloped style).
// Pattern A from Neo's WI-20 scope doc: full-replacement payload snapshot.
// ---------------------------------------------------------------------------

export const transactionUpdatedPayloadSchema = z.object({
  id: z.string().length(26), // ULID (transaction id — unchanged)
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: transactionTypeSchema,
  amount: z.number().nonnegative(),
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26), // ULID (immutable)
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: transactionStatusSchema,
  createdAt: z.string().datetime(), // Original creation timestamp (unchanged)
  updatedAt: z.string().datetime(), // When the edit occurred
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
  // WI-31a — Optional correlation id (ULID) grouping bulk-update events.
  // Additive — reducers ignore it. Present only when the event was emitted
  // by bulkUpdateTransactions; absent for single-tx updates.
  correlationId: z.string().length(26).optional(),
});

export type TransactionUpdatedPayload = z.infer<typeof transactionUpdatedPayloadSchema>;

export const transactionUpdatedEventSchema = eventEnvelopeSchema.extend({
  type: z.literal('tx.updated'),
  payload: transactionUpdatedPayloadSchema,
});

export type TransactionUpdatedEvent = z.infer<typeof transactionUpdatedEventSchema>;

export const transactionDeletedEventSchema = z.object({
  type: z.literal('tx.deleted'),
  id: z.string().length(26), // Event ULID (unique per deletion event)
  txId: z.string().length(26), // Transaction being deleted
  deletedAt: z.string().datetime(),
  datasetId: z.string().length(26),
  actorDeviceId: z.string().length(26),
  dekVersion: z.number().int().nonnegative(),
  version: z.number().int().positive().default(1),
});

export type TransactionDeletedEvent = z.infer<typeof transactionDeletedEventSchema>;

// ---------------------------------------------------------------------------
// SPEC-023 — Transaction split events (flat wire-style, no envelope).
// Splits let a treasurer divide a single confirmed transaction into ≥2 child
// amounts, each with its own category/subcategory/comment. The parent remains
// visible in the Movements list but financial aggregations use split amounts.
//
// Integer cents: Child amounts stored as `amountCents` (e.g. 30000 = €300.00)
// to eliminate floating-point drift in the sum invariant. UI converts at edge.
// Parent amounts remain floats (pre-existing). This sets precedent for future
// migration but ONLY split children use integer cents for now (FR4).
//
// Two events:
//   - tx.split         (create/replace split state for a parent)
//   - tx.split.removed (revert parent to un-split single-line behaviour)
// ---------------------------------------------------------------------------

export const MAX_SPLITS_PER_TX = 20;
export const SPLIT_COMMENT_MAX = 500;

export const transactionSplitRowSchema = z.object({
  splitId: z.string().length(26), // ULID — stable PK in read model
  amountCents: z.number().int().positive(), // EUR cents (e.g. 30000 = €300.00)
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  comment: z.string().max(SPLIT_COMMENT_MAX).nullable(),
  sortOrder: z.number().int().nonnegative(),
});

export type TransactionSplitRow = z.infer<typeof transactionSplitRowSchema>;

export const transactionSplitEventSchema = z.object({
  type: z.literal('tx.split'),
  id: z.string().length(26), // Event ULID
  parentTxId: z.string().length(26), // FK → Transaction.id
  splits: z.array(transactionSplitRowSchema).min(2).max(MAX_SPLITS_PER_TX),
  createdAt: z.string().datetime(),
});

export type TransactionSplitEvent = z.infer<typeof transactionSplitEventSchema>;

export const transactionSplitRemovedEventSchema = z.object({
  type: z.literal('tx.split.removed'),
  id: z.string().length(26), // Event ULID
  parentTxId: z.string().length(26),
  removedAt: z.string().datetime(),
});

export type TransactionSplitRemovedEvent = z.infer<typeof transactionSplitRemovedEventSchema>;

// Union type for all domain events
export type DomainEvent =
  | TransactionCreatedEvent
  | AccountCreatedEvent
  | CategoryCreatedEvent
  | TagCreatedEvent
  | ConfigAccountCreatedEvent
  | ConfigAccountUpdatedEvent
  | ConfigAccountArchivedEvent
  | ConfigAccountUnarchivedEvent
  | ConfigCategoryCreatedEvent
  | ConfigCategoryUpdatedEvent
  | ConfigCategoryArchivedEvent
  | ConfigCategoryUnarchivedEvent
  | ConfigSubcategoryCreatedEvent
  | ConfigSubcategoryUpdatedEvent
  | ConfigSubcategoryArchivedEvent
  | ConfigSubcategoryUnarchivedEvent
  | ConfigTagCreatedEvent
  | ConfigTagUpdatedEvent
  | ConfigTagArchivedEvent
  | ConfigTagUnarchivedEvent
  | MovementImportedEvent
  | ImportMappingUpdatedEvent
  | TransactionNoteAddedEvent
  | TransactionNoteEditedEvent
  | TransactionNoteDeletedEvent
  | TransactionUpdatedEvent
  | TransactionDeletedEvent
  | TransactionSplitEvent
  | TransactionSplitRemovedEvent;
