// Categories IPC contract — WI-15-lite + WI-21.
// Channel + Zod schemas for `categories:create`, `categories:list`, and
// (WI-21) `categories:update`, `categories:archive`, `categories:unarchive`,
// plus subcategory CRUD: `subcategories:create`, `subcategories:update`,
// `subcategories:archive`, `subcategories:unarchive`. Event-sourced.
// Archive-only per Switch's WI-21 ruling — NO hard-delete.
//
// 2026-04-22 — Pedro reversed the Q4 direction-agnostic decision when he
// handed back the updated Categorías prototype (see
// .squad/decisions/inbox/prototype-categorias.png). Categories now carry
// an **optional** `kind` (income|expense) so the master-detail screen can
// render the Ingreso/Gasto pills and the Todas/Ingresos/Gastos filter.
// Optional at the wire level so NDJSON events written before this change
// still replay cleanly; the renderer modal treats it as required for any
// *new* category.
//
// WI-21 — subcategories are inlined on CategoryRecord.subcategories but
// their lifecycle events are first-class on the NDJSON log (parent-scoped
// via `parentCategoryId`). See .squad/decisions/inbox/
// morpheus-wi21-events-ipc.md for the shape decision.

import { z } from 'zod';

export const categoryKindSchema = z.enum(['income', 'expense']);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const IPC_CATEGORIES_CREATE = 'categories:create';
export const IPC_CATEGORIES_LIST = 'categories:list';
export const IPC_CATEGORIES_UPDATE = 'categories:update';
export const IPC_CATEGORIES_ARCHIVE = 'categories:archive';
export const IPC_CATEGORIES_UNARCHIVE = 'categories:unarchive';
export const IPC_SUBCATEGORIES_CREATE = 'subcategories:create';
export const IPC_SUBCATEGORIES_UPDATE = 'subcategories:update';
export const IPC_SUBCATEGORIES_ARCHIVE = 'subcategories:archive';
export const IPC_SUBCATEGORIES_UNARCHIVE = 'subcategories:unarchive';

// ============================================================================
// Wire-level events
// ============================================================================

export const categoryCreatedEventSchema = z.object({
  type: z.literal('CategoryCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  kind: categoryKindSchema.optional(),
  // WI-23 — required; see core/events/schemas.ts.
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type CategoryCreatedEvent = z.infer<typeof categoryCreatedEventSchema>;

export const categoryChangesSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: z.string().optional(),
    kind: categoryKindSchema.optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'changes must be non-empty',
  });

export type CategoryChanges = z.infer<typeof categoryChangesSchema>;

export const categoryUpdatedEventSchema = z.object({
  type: z.literal('CategoryUpdated'),
  id: z.string().min(1),
  categoryId: z.string().min(1),
  changes: categoryChangesSchema,
  updatedAt: z.string().datetime(),
});

export type CategoryUpdatedEvent = z.infer<typeof categoryUpdatedEventSchema>;

export const categoryArchivedEventSchema = z.object({
  type: z.literal('CategoryArchived'),
  id: z.string().min(1),
  categoryId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type CategoryArchivedEvent = z.infer<typeof categoryArchivedEventSchema>;

export const categoryUnarchivedEventSchema = z.object({
  type: z.literal('CategoryUnarchived'),
  id: z.string().min(1),
  categoryId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type CategoryUnarchivedEvent = z.infer<typeof categoryUnarchivedEventSchema>;

export const subcategoryCreatedEventSchema = z.object({
  type: z.literal('SubcategoryCreated'),
  id: z.string().min(1),
  parentCategoryId: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  createdAt: z.string().datetime(),
});

export type SubcategoryCreatedEvent = z.infer<typeof subcategoryCreatedEventSchema>;

export const subcategoryChangesSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: z.string().optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'changes must be non-empty',
  });

export type SubcategoryChanges = z.infer<typeof subcategoryChangesSchema>;

export const subcategoryUpdatedEventSchema = z.object({
  type: z.literal('SubcategoryUpdated'),
  id: z.string().min(1),
  subcategoryId: z.string().min(1),
  parentCategoryId: z.string().min(1),
  changes: subcategoryChangesSchema,
  updatedAt: z.string().datetime(),
});

export type SubcategoryUpdatedEvent = z.infer<typeof subcategoryUpdatedEventSchema>;

export const subcategoryArchivedEventSchema = z.object({
  type: z.literal('SubcategoryArchived'),
  id: z.string().min(1),
  subcategoryId: z.string().min(1),
  parentCategoryId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type SubcategoryArchivedEvent = z.infer<typeof subcategoryArchivedEventSchema>;

export const subcategoryUnarchivedEventSchema = z.object({
  type: z.literal('SubcategoryUnarchived'),
  id: z.string().min(1),
  subcategoryId: z.string().min(1),
  parentCategoryId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type SubcategoryUnarchivedEvent = z.infer<typeof subcategoryUnarchivedEventSchema>;

// ============================================================================
// Read-model record
// ============================================================================

export const subcategoryRecordSchema = z.object({
  id: z.string().min(1),
  parentCategoryId: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export type SubcategoryRecord = z.infer<typeof subcategoryRecordSchema>;

export const categoryRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  kind: categoryKindSchema.optional(),
  // WI-23 — required on the wire record (projection always supplies it).
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
  // Inlined subcategory tree. Always populated by the projection (may be
  // an empty array); optional at the wire level so renderer-side optimistic
  // updates can omit it when constructing a record from a `*Created` event.
  subcategories: z.array(subcategoryRecordSchema).optional(),
});

export type CategoryRecord = z.infer<typeof categoryRecordSchema>;

// ============================================================================
// Request — create
// ============================================================================

export const createCategoryRequestSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
  kind: categoryKindSchema.optional(),
});

export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

export const createSubcategoryRequestSchema = z.object({
  parentCategoryId: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
});

export type CreateSubcategoryRequest = z.infer<typeof createSubcategoryRequestSchema>;

// ============================================================================
// Response
// ============================================================================

export const categoryErrorCodeSchema = z.enum([
  'NAME_EMPTY',
  'NAME_DUPLICATE',
  'NOT_FOUND',
  'PARENT_NOT_FOUND',
  'ALREADY_ARCHIVED',
  'NOT_ARCHIVED',
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

export const createSubcategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: subcategoryCreatedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type CreateSubcategoryResponse = z.infer<typeof createSubcategoryResponseSchema>;

// ============================================================================
// List
// ============================================================================

export const categoriesListRequestSchema = z
  .object({
    includeArchived: z.boolean().optional(),
  })
  .optional();

export type CategoriesListRequest = z.infer<typeof categoriesListRequestSchema>;

export const categoriesListResponseSchema = z.object({
  categories: z.array(categoryRecordSchema),
});

export type CategoriesListResponse = z.infer<typeof categoriesListResponseSchema>;

export type ListCategoriesResponse = CategoriesListResponse;

// ============================================================================
// WI-21 — Update / Archive / Unarchive (category)
// ============================================================================

export const updateCategoryRequestSchema = z.object({
  id: z.string().min(1),
  changes: categoryChangesSchema,
});

export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const updateCategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: categoryUpdatedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type UpdateCategoryResponse = z.infer<typeof updateCategoryResponseSchema>;

export const archiveCategoryRequestSchema = z.object({
  id: z.string().min(1),
});

export type ArchiveCategoryRequest = z.infer<typeof archiveCategoryRequestSchema>;

export const archiveCategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: categoryArchivedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type ArchiveCategoryResponse = z.infer<typeof archiveCategoryResponseSchema>;

export const unarchiveCategoryRequestSchema = z.object({
  id: z.string().min(1),
});

export type UnarchiveCategoryRequest = z.infer<typeof unarchiveCategoryRequestSchema>;

export const unarchiveCategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: categoryUnarchivedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type UnarchiveCategoryResponse = z.infer<typeof unarchiveCategoryResponseSchema>;

// ============================================================================
// WI-21 — Update / Archive / Unarchive (subcategory)
// ============================================================================

export const updateSubcategoryRequestSchema = z.object({
  id: z.string().min(1),
  parentCategoryId: z.string().min(1),
  changes: subcategoryChangesSchema,
});

export type UpdateSubcategoryRequest = z.infer<typeof updateSubcategoryRequestSchema>;

export const updateSubcategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: subcategoryUpdatedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type UpdateSubcategoryResponse = z.infer<typeof updateSubcategoryResponseSchema>;

export const archiveSubcategoryRequestSchema = z.object({
  id: z.string().min(1),
  parentCategoryId: z.string().min(1),
});

export type ArchiveSubcategoryRequest = z.infer<typeof archiveSubcategoryRequestSchema>;

export const archiveSubcategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: subcategoryArchivedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type ArchiveSubcategoryResponse = z.infer<typeof archiveSubcategoryResponseSchema>;

export const unarchiveSubcategoryRequestSchema = z.object({
  id: z.string().min(1),
  parentCategoryId: z.string().min(1),
});

export type UnarchiveSubcategoryRequest = z.infer<typeof unarchiveSubcategoryRequestSchema>;

export const unarchiveSubcategoryResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: subcategoryUnarchivedEventSchema }),
  z.object({ ok: z.literal(false), error: categoryErrorSchema }),
]);

export type UnarchiveSubcategoryResponse = z.infer<typeof unarchiveSubcategoryResponseSchema>;
