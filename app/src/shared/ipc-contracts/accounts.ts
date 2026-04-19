// Accounts IPC contract — WI-15-lite.
// Channel + Zod schemas for `accounts:create` and `accounts:list`.
// Event-sourced per Pedro's Q1 answer: AccountCreated events are appended to
// the same NDJSON event log as transactions and folded into the read model.
// EUR-only for v1 (currency field retained for forward-compat, hidden in UI).

import { z } from 'zod';

export const IPC_ACCOUNTS_CREATE = 'accounts:create';
export const IPC_ACCOUNTS_LIST = 'accounts:list';

// ============================================================================
// Wire-level event — flat shape Trinity consumes from create response
// ============================================================================

export const accountCreatedEventSchema = z.object({
  type: z.literal('AccountCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().optional(),
  currency: z.literal('EUR'),
  openingBalance: z.number(),
  createdAt: z.string().datetime(),
});

export type AccountCreatedEvent = z.infer<typeof accountCreatedEventSchema>;

// ============================================================================
// Read-model record — return shape for accounts:list
// ============================================================================

export const accountRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bankName: z.string().optional(),
  currency: z.literal('EUR'),
  openingBalance: z.number(),
  createdAt: z.string().datetime(),
});

export type AccountRecord = z.infer<typeof accountRecordSchema>;

// ============================================================================
// Request — CreateAccountRequest
// ============================================================================

export const createAccountRequestSchema = z.object({
  name: z.string(),
  bankName: z.string().optional(),
  openingBalance: z.number().optional(),
});

export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

// ============================================================================
// Response — discriminated union
// ============================================================================

export const accountErrorCodeSchema = z.enum([
  'NAME_EMPTY',
  'NAME_DUPLICATE',
  'OPENING_BALANCE_INVALID',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type AccountErrorCode = z.infer<typeof accountErrorCodeSchema>;

export const accountErrorSchema = z.object({
  code: accountErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
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

export const accountsListRequestSchema = z.object({}).optional();

export type AccountsListRequest = z.infer<typeof accountsListRequestSchema>;

export const accountsListResponseSchema = z.object({
  accounts: z.array(accountRecordSchema),
});

export type AccountsListResponse = z.infer<typeof accountsListResponseSchema>;

// Renderer-side alias matching Trinity's existing types/config.ts shape.
export type ListAccountsResponse = AccountsListResponse;
