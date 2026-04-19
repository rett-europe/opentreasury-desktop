// Tags IPC contract — WI-15-lite.
// Channel + Zod schemas for `tags:create` and `tags:list`. Event-sourced.

import { z } from 'zod';

export const IPC_TAGS_CREATE = 'tags:create';
export const IPC_TAGS_LIST = 'tags:list';

// ============================================================================
// Wire-level event
// ============================================================================

export const tagCreatedEventSchema = z.object({
  type: z.literal('TagCreated'),
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type TagCreatedEvent = z.infer<typeof tagCreatedEventSchema>;

// ============================================================================
// Read-model record
// ============================================================================

export const tagRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});

export type TagRecord = z.infer<typeof tagRecordSchema>;

// ============================================================================
// Request
// ============================================================================

export const createTagRequestSchema = z.object({
  name: z.string(),
});

export type CreateTagRequest = z.infer<typeof createTagRequestSchema>;

// ============================================================================
// Response
// ============================================================================

export const tagErrorCodeSchema = z.enum([
  'NAME_EMPTY',
  'NAME_DUPLICATE',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type TagErrorCode = z.infer<typeof tagErrorCodeSchema>;

export const tagErrorSchema = z.object({
  code: tagErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
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

export const tagsListRequestSchema = z.object({}).optional();

export type TagsListRequest = z.infer<typeof tagsListRequestSchema>;

export const tagsListResponseSchema = z.object({
  tags: z.array(tagRecordSchema),
});

export type TagsListResponse = z.infer<typeof tagsListResponseSchema>;

export type ListTagsResponse = TagsListResponse;
