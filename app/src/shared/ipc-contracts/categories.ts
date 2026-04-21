// Categories IPC contract — WI-15-lite.
// Channel + Zod schemas for `categories:create` and `categories:list`.
// Event-sourced.
//
// 2026-04-22 — Pedro reversed the Q4 direction-agnostic decision when he
// handed back the updated Categorías prototype (see
// .squad/decisions/inbox/prototype-categorias.png). Categories now carry
// an **optional** `kind` (income|expense) so the master-detail screen can
// render the Ingreso/Gasto pills and the Todas/Ingresos/Gastos filter.
// Optional at the wire level so NDJSON events written before this change
// still replay cleanly; the renderer modal treats it as required for any
// *new* category.

import { z } from 'zod';

export const categoryKindSchema = z.enum(['income', 'expense']);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const IPC_CATEGORIES_CREATE = 'categories:create';
export const IPC_CATEGORIES_LIST = 'categories:list';

// ============================================================================
// Wire-level event
// ============================================================================

export const categoryCreatedEventSchema = z.object({
  type: z.literal('CategoryCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  kind: categoryKindSchema.optional(),
  createdAt: z.string().datetime(),
});

export type CategoryCreatedEvent = z.infer<typeof categoryCreatedEventSchema>;

// ============================================================================
// Read-model record
// ============================================================================

export const categoryRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  kind: categoryKindSchema.optional(),
  createdAt: z.string().datetime(),
});

export type CategoryRecord = z.infer<typeof categoryRecordSchema>;

// ============================================================================
// Request
// ============================================================================

export const createCategoryRequestSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  kind: categoryKindSchema.optional(),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

// ============================================================================
// Response
// ============================================================================

export const categoryErrorCodeSchema = z.enum([
  'NAME_EMPTY',
  'NAME_DUPLICATE',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type CategoryErrorCode = z.infer<typeof categoryErrorCodeSchema>;

export const categoryErrorSchema = z.object({
  code: categoryErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
});

export type CategoryError = z.infer<typeof categoryErrorSchema>;

export const createCategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: categoryCreatedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type CreateCategoryResponse = z.infer<typeof createCategoryResponseSchema>;

// ============================================================================
// List
// ============================================================================

export const categoriesListRequestSchema = z.object({}).optional();

export type CategoriesListRequest = z.infer<typeof categoriesListRequestSchema>;

export const categoriesListResponseSchema = z.object({
  categories: z.array(categoryRecordSchema),
});

export type CategoriesListResponse = z.infer<typeof categoriesListResponseSchema>;

export type ListCategoriesResponse = CategoriesListResponse;
