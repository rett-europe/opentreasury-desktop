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
  amount: z.number().positive(), // Always positive; type determines sign
  currency: z.literal('EUR'),
  description: z.string().max(500),
  accountId: z.string().length(26), // ULID
  categoryId: z.string().length(26).nullable(),
  subcategoryId: z.string().length(26).nullable(),
  tagIds: z.array(z.string().length(26)),
  status: transactionStatusSchema,
  createdAt: z.string().datetime(), // ISO 8601 UTC
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

// Union type for all domain events
export type DomainEvent =
  | TransactionCreatedEvent
  | AccountCreatedEvent
  | CategoryCreatedEvent
  | TagCreatedEvent;
