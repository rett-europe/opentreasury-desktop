// Tags IPC contract — WI-15-lite + WI-21.
// Channel + Zod schemas for `tags:create`, `tags:list`, and (WI-21)
// `tags:update`, `tags:archive`, `tags:unarchive`. Event-sourced.
// Archive-only per Switch's WI-21 ruling — NO hard-delete.

import { z } from 'zod';

export const IPC_TAGS_CREATE = 'tags:create';
export const IPC_TAGS_LIST = 'tags:list';
export const IPC_TAGS_UPDATE = 'tags:update';
export const IPC_TAGS_ARCHIVE = 'tags:archive';
export const IPC_TAGS_UNARCHIVE = 'tags:unarchive';
export const IPC_TAGS_DELETE = 'tags:delete';
export const IPC_TAGS_USAGE = 'tags:usage';

// ============================================================================
// Wire-level events
// ============================================================================

export const tagCreatedEventSchema = z.object({
  type: z.literal('TagCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  // PR#2 parity — optional for backward-compat.
  color: z.string().optional(),
  // WI-23 — required; see core/events/schemas.ts.
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
});

export type TagCreatedEvent = z.infer<typeof tagCreatedEventSchema>;

export const tagChangesSchema = z
  .object({
    name: z.string().min(1).optional(),
    color: z.string().optional(),
  })
  .refine((c) => Object.values(c).some((v) => v !== undefined), {
    message: 'changes must be non-empty',
  });

export type TagChanges = z.infer<typeof tagChangesSchema>;

export const tagUpdatedEventSchema = z.object({
  type: z.literal('TagUpdated'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  changes: tagChangesSchema,
  updatedAt: z.string().datetime(),
});

export type TagUpdatedEvent = z.infer<typeof tagUpdatedEventSchema>;

export const tagArchivedEventSchema = z.object({
  type: z.literal('TagArchived'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  archivedAt: z.string().datetime(),
});

export type TagArchivedEvent = z.infer<typeof tagArchivedEventSchema>;

export const tagUnarchivedEventSchema = z.object({
  type: z.literal('TagUnarchived'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  unarchivedAt: z.string().datetime(),
});

export type TagUnarchivedEvent = z.infer<typeof tagUnarchivedEventSchema>;

// WI-21-followup — hard-delete event (gated on usage_count === 0 by handler).
export const tagDeletedEventSchema = z.object({
  type: z.literal('TagDeleted'),
  id: z.string().min(1),
  tagId: z.string().min(1),
  deletedAt: z.string().datetime(),
});

export type TagDeletedEvent = z.infer<typeof tagDeletedEventSchema>;

// ============================================================================
// Read-model record
// ============================================================================

export const tagRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().optional(),
  // WI-23 — required on the wire record.
  sortOrder: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().optional(),
});

export type TagRecord = z.infer<typeof tagRecordSchema>;

// ============================================================================
// Request
// ============================================================================

export const createTagRequestSchema = z.object({
  name: z.string(),
  color: z.string().optional(),
});

export type CreateTagRequest = z.infer<typeof createTagRequestSchema>;

// ============================================================================
// Response
// ============================================================================

export const tagErrorCodeSchema = z.enum([
  'NAME_EMPTY',
  'NAME_DUPLICATE',
  'NOT_FOUND',
  'ALREADY_ARCHIVED',
  'NOT_ARCHIVED',
  'HAS_REFERENCES',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type TagErrorCode = z.infer<typeof tagErrorCodeSchema>;

export const tagErrorSchema = z.object({
  code: tagErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
  // Populated on HAS_REFERENCES.
  transactionCount: z.number().int().nonnegative().optional(),
});

export type TagError = z.infer<typeof tagErrorSchema>;

export const createTagResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: tagCreatedEventSchema }),
  z.object({ ok: z.literal(false), error: tagErrorSchema }),
]);

export type CreateTagResponse = z.infer<typeof createTagResponseSchema>;

// ============================================================================
// List
// ============================================================================

export const tagsListRequestSchema = z
  .object({
    includeArchived: z.boolean().optional(),
  })
  .optional();

export type TagsListRequest = z.infer<typeof tagsListRequestSchema>;

export const tagsListResponseSchema = z.object({
  tags: z.array(tagRecordSchema),
});

export type TagsListResponse = z.infer<typeof tagsListResponseSchema>;

export type ListTagsResponse = TagsListResponse;

// ============================================================================
// WI-21 — Update / Archive / Unarchive
// ============================================================================

export const updateTagRequestSchema = z.object({
  id: z.string().min(1),
  changes: tagChangesSchema,
});

export type UpdateTagRequest = z.infer<typeof updateTagRequestSchema>;

export const updateTagResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: tagUpdatedEventSchema }),
  z.object({ ok: z.literal(false), error: tagErrorSchema }),
]);

export type UpdateTagResponse = z.infer<typeof updateTagResponseSchema>;

export const archiveTagRequestSchema = z.object({
  id: z.string().min(1),
});

export type ArchiveTagRequest = z.infer<typeof archiveTagRequestSchema>;

export const archiveTagResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: tagArchivedEventSchema }),
  z.object({ ok: z.literal(false), error: tagErrorSchema }),
]);

export type ArchiveTagResponse = z.infer<typeof archiveTagResponseSchema>;

export const unarchiveTagRequestSchema = z.object({
  id: z.string().min(1),
});

export type UnarchiveTagRequest = z.infer<typeof unarchiveTagRequestSchema>;

export const unarchiveTagResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: tagUnarchivedEventSchema }),
  z.object({ ok: z.literal(false), error: tagErrorSchema }),
]);

export type UnarchiveTagResponse = z.infer<typeof unarchiveTagResponseSchema>;

// ============================================================================
// WI-21-followup — Hard-delete (gated on usage_count === 0)
// ============================================================================

export const deleteTagRequestSchema = z.object({
  id: z.string().min(1),
});

export type DeleteTagRequest = z.infer<typeof deleteTagRequestSchema>;

export const deleteTagResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: tagDeletedEventSchema }),
  z.object({ ok: z.literal(false), error: tagErrorSchema }),
]);

export type DeleteTagResponse = z.infer<typeof deleteTagResponseSchema>;

export const tagUsageRecordSchema = z.object({
  tagId: z.string().min(1),
  transactionCount: z.number().int().nonnegative(),
});

export type TagUsageRecord = z.infer<typeof tagUsageRecordSchema>;

export const tagsUsageResponseSchema = z.object({
  usage: z.array(tagUsageRecordSchema),
});

export type TagsUsageResponse = z.infer<typeof tagsUsageResponseSchema>;
