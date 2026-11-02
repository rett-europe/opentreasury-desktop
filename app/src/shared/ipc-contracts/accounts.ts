// Accounts IPC contract — WI-15-lite + WI-21.
// Channel + Zod schemas for `accounts:create`, `accounts:list`, and
// (WI-21) `accounts:update`, `accounts:archive`, `accounts:unarchive`.
// Event-sourced per Pedro's Q1 answer: AccountCreated/Updated/Archived/
// Unarchived events are appended to the same NDJSON event log as
// transactions and folded into the read model. Archive-only per Switch's
// WI-21 ruling — NO hard-delete.
// EUR-only for v1 (currency field retained for forward-compat, hidden in UI).

import { z } from 'zod';

export const IPC_ACCOUNTS_CREATE = 'accounts:create';
export const IPC_ACCOUNTS_LIST = 'accounts:list';
export const IPC_ACCOUNTS_UPDATE = 'accounts:update';
export const IPC_ACCOUNTS_ARCHIVE = 'accounts:archive';
export const IPC_ACCOUNTS_UNARCHIVE = 'accounts:unarchive';
export const IPC_ACCOUNTS_DELETE = 'accounts:delete';
export const IPC_ACCOUNTS_USAGE = 'accounts:usage';

// ============================================================================
// Wire-level events — flat shape Trinity consumes from handler responses
// ============================================================================

export const accountCreatedEventSchema = z.object({
  type: z.literal('AccountCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().optional(),
  // PR#2 parity — see config-diff-report 2026-04-21. These fields are optional
  // on the wire for backward-compat with events written before the fields existed.
  label: z.string().optional(),
  iban: z.string().optional(),
  color: z.string().optional(),
  isPaypal: z.boolean().optional(),
  currency: z.literal('EUR'),
  openingBalance: z.number(),
  // WI-23 — required on every new event; see core/events/schemas.ts.
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type AccountCreatedEvent = z.infer<typeof accountCreatedEventSchema>;

const accountChangeFields = {
  name: z.string().min(1).optional(),
  bankName: z.string().optional(),
  label: z.string().optional(),
  iban: z.string().optional(),
  color: z.string().optional(),
  isPaypal: z.boolean().optional(),
};

const requireAccountChange = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  schema.refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'changes must be non-empty',
  });

export const accountChangesSchema = requireAccountChange(
  z.object({
    ...accountChangeFields,
    // Keep event validation finite; input validation uses the companion schema below.
    openingBalance: z.number().optional(),
  }),
);

const accountChangesRequestSchema = requireAccountChange(
  z.object({
    ...accountChangeFields,
    // Let the handler return OPENING_BALANCE_INVALID for NaN/Infinity.
    openingBalance: z.custom<number>((value) => typeof value === 'number').optional(),
  }),
);

export type AccountChanges = z.infer<typeof accountChangesSchema>;

export const accountUpdatedEventSchema = z.object({
  type: z.literal('AccountUpdated'),
  id: z.string().min(1),
  accountId: z.string().min(1),
  changes: accountChangesSchema,
  updatedAt: z.string().datetime(),
});

export type AccountUpdatedEvent = z.infer<typeof accountUpdatedEventSchema>;

export const accountArchivedEventSchema = z.object({
  type: z.literal('AccountArchived'),
  id: z.string().min(1),
  accountId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type AccountArchivedEvent = z.infer<typeof accountArchivedEventSchema>;

export const accountUnarchivedEventSchema = z.object({
  type: z.literal('AccountUnarchived'),
  id: z.string().min(1),
  accountId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type AccountUnarchivedEvent = z.infer<typeof accountUnarchivedEventSchema>;

// WI-21-followup — hard-delete event. Handler gates it on usage_count === 0
// (see `selectAccountUsage`); reducer drops the account from the read model.
export const accountDeletedEventSchema = z.object({
  type: z.literal('AccountDeleted'),
  id: z.string().min(1),
  accountId: z.string().min(1),
  deletedAt: z.string().datetime(),
});

export type AccountDeletedEvent = z.infer<typeof accountDeletedEventSchema>;

// ============================================================================
// Read-model record — return shape for accounts:list
// ============================================================================

export const accountRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().optional(),
  label: z.string().optional(),
  iban: z.string().optional(),
  color: z.string().optional(),
  isPaypal: z.boolean().optional(),
  currency: z.literal('EUR'),
  openingBalance: z.number(),
  // WI-23 — required (list response projection always includes it).
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  // WI-21 — present on archived accounts; undefined for active ones.
  archivedAt: z.string().datetime().optional(),
});

export type AccountRecord = z.infer<typeof accountRecordSchema>;

// ============================================================================
// Request — CreateAccountRequest
// ============================================================================

export const createAccountRequestSchema = z.object({
  name: z.string(),
  bankName: z.string().optional(),
  label: z.string().optional(),
  iban: z.string().optional(),
  color: z.string().optional(),
  isPaypal: z.boolean().optional(),
  openingBalance: z.custom<number>((value) => typeof value === 'number').optional(),
});

export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

// ============================================================================
// Response — discriminated union
// ============================================================================

export const accountErrorCodeSchema = z.enum([
  'NAME_EMPTY',
  'NAME_DUPLICATE',
  'OPENING_BALANCE_INVALID',
  'NOT_FOUND',
  'ALREADY_ARCHIVED',
  'NOT_ARCHIVED',
  'HAS_REFERENCES',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type AccountErrorCode = z.infer<typeof accountErrorCodeSchema>;

export const accountErrorSchema = z.object({
  code: accountErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
  // Populated on HAS_REFERENCES errors so the UI can render
  // "X transactions reference this account".
  transactionCount: z.number().int().nonnegative().optional(),
});

export type AccountError = z.infer<typeof accountErrorSchema>;

export const createAccountResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: accountCreatedEventSchema }),
  z.object({ ok: z.literal(false), error: accountErrorSchema }),
]);

export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;

// ============================================================================
// List
// ============================================================================

export const accountsListRequestSchema = z
  .object({
    // WI-21 — default false; renderer opts in via "Mostrar archivadas".
    includeArchived: z.boolean().optional(),
  })
  .optional();

export type AccountsListRequest = z.infer<typeof accountsListRequestSchema>;

export const accountsListResponseSchema = z.object({
  accounts: z.array(accountRecordSchema),
});

export type AccountsListResponse = z.infer<typeof accountsListResponseSchema>;

// Renderer-side alias matching Trinity's existing types/config.ts shape.
export type ListAccountsResponse = AccountsListResponse;

// ============================================================================
// WI-21 — Update / Archive / Unarchive
// ============================================================================

export const updateAccountRequestSchema = z.object({
  id: z.string().min(1),
  changes: accountChangesRequestSchema,
});

export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

export const updateAccountResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: accountUpdatedEventSchema }),
  z.object({ ok: z.literal(false), error: accountErrorSchema }),
]);

export type UpdateAccountResponse = z.infer<typeof updateAccountResponseSchema>;

export const archiveAccountRequestSchema = z.object({
  id: z.string().min(1),
});

export type ArchiveAccountRequest = z.infer<typeof archiveAccountRequestSchema>;

export const archiveAccountResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: accountArchivedEventSchema }),
  z.object({ ok: z.literal(false), error: accountErrorSchema }),
]);

export type ArchiveAccountResponse = z.infer<typeof archiveAccountResponseSchema>;

export const unarchiveAccountRequestSchema = z.object({
  id: z.string().min(1),
});

export type UnarchiveAccountRequest = z.infer<typeof unarchiveAccountRequestSchema>;

export const unarchiveAccountResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: accountUnarchivedEventSchema }),
  z.object({ ok: z.literal(false), error: accountErrorSchema }),
]);

export type UnarchiveAccountResponse = z.infer<typeof unarchiveAccountResponseSchema>;

// ============================================================================
// WI-21-followup — Hard-delete (gated on usage_count === 0)
// ============================================================================

export const deleteAccountRequestSchema = z.object({
  id: z.string().min(1),
});

export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

export const deleteAccountResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: accountDeletedEventSchema }),
  z.object({ ok: z.literal(false), error: accountErrorSchema }),
]);

export type DeleteAccountResponse = z.infer<typeof deleteAccountResponseSchema>;

// ============================================================================
// Usage counters — used by the renderer to gate the Delete button per row,
// and by the handler to reject HAS_REFERENCES when usage_count > 0.
// ============================================================================

export const accountUsageRecordSchema = z.object({
  accountId: z.string().min(1),
  transactionCount: z.number().int().nonnegative(),
});

export type AccountUsageRecord = z.infer<typeof accountUsageRecordSchema>;

export const accountsUsageResponseSchema = z.object({
  usage: z.array(accountUsageRecordSchema),
});

export type AccountsUsageResponse = z.infer<typeof accountsUsageResponseSchema>;
