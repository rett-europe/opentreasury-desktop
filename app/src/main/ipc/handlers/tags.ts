// tags:* IPC handler factories — WI-15-lite + WI-21.
// Archive-only (no hard-delete) per Switch's WI-21 ruling.

import type { EventLog } from '../../../core/eventLog/index.js';
import type {
  ConfigTagArchivedEvent,
  ConfigTagCreatedEvent,
  ConfigTagDeletedEvent,
  ConfigTagUnarchivedEvent,
  ConfigTagUpdatedEvent,
} from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import { stampActorAttribution } from './configActorAttribution.js';
import {
  archiveTagRequestSchema,
  createTagRequestSchema,
  deleteTagRequestSchema,
  unarchiveTagRequestSchema,
  updateTagRequestSchema,
  type ArchiveTagResponse,
  type CreateTagResponse,
  type DeleteTagResponse,
  type TagRecord,
  type TagsUsageResponse,
  type UnarchiveTagResponse,
  type UpdateTagResponse,
} from '../../../shared/ipc-contracts/tags.js';
import { selectActiveTags, selectTags, selectTagUsage } from '../../projections/config.js';

export interface TagsHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly applyEvent?: typeof coreApplyEvent;
  // #388 — actor/device attribution (see accounts.ts / configActorAttribution).
  readonly actorUserId?: string;
  readonly actorDeviceId?: string;
}

async function appendAndApply(
  deps: TagsHandlerDeps,
  event: Parameters<typeof coreApplyEvent>[0],
): Promise<void> {
  const apply = deps.applyEvent ?? coreApplyEvent;
  // #388 — stamp actor/device at append time so config rows are attributable.
  const stamped = stampActorAttribution(deps, event);
  const before = (await deps.eventLog.load()).length;
  await deps.eventLog.append(stamped);
  const after = (await deps.eventLog.load()).length;
  if (after > before) {
    apply(stamped);
  }
}

export function createTagsCreateHandler(
  deps: TagsHandlerDeps,
): (raw: unknown) => Promise<CreateTagResponse> {
  return async function handleTagsCreate(raw: unknown): Promise<CreateTagResponse> {
    try {
      const parsed = createTagRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const name = parsed.data.name.trim();
      if (name.length === 0) {
        return {
          ok: false,
          error: { code: 'NAME_EMPTY', message: 'Tag name is required', field: 'name' },
        };
      }

      const existing = deps.getReadModel().configTags;
      const clash = existing.some((t) => t.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) {
        return {
          ok: false,
          error: {
            code: 'NAME_DUPLICATE',
            message: `A tag named "${name}" already exists`,
            field: 'name',
          },
        };
      }

      const color = parsed.data.color?.trim();
      // WI-23 — handler-assigned sortOrder, global across active + archived.
      const maxSortOrder = existing.reduce<number>((acc, t) => Math.max(acc, t.sortOrder), -1);
      const sortOrder = maxSortOrder + 1;
      const event: ConfigTagCreatedEvent = {
        type: 'TagCreated',
        id: deps.newId(),
        name,
        sortOrder,
        createdAt: deps.now().toISOString(),
        ...(color !== undefined && color.length > 0 ? { color } : {}),
      };

      await appendAndApply(deps, event);

      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createTagsListHandler(
  deps: Pick<TagsHandlerDeps, 'getReadModel'>,
): (raw?: unknown) => Promise<{ tags: TagRecord[] }> {
  return async function handleTagsList(raw?: unknown): Promise<{ tags: TagRecord[] }> {
    const includeArchived =
      typeof raw === 'object' &&
      raw !== null &&
      'includeArchived' in raw &&
      (raw as { includeArchived?: unknown }).includeArchived === true;
    const model = deps.getReadModel();
    return { tags: includeArchived ? selectTags(model) : selectActiveTags(model) };
  };
}

export function createTagsUpdateHandler(
  deps: TagsHandlerDeps,
): (raw: unknown) => Promise<UpdateTagResponse> {
  return async function handleTagsUpdate(raw: unknown): Promise<UpdateTagResponse> {
    try {
      const parsed = updateTagRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id, changes } = parsed.data;
      const existing = deps.getReadModel().configTags;
      const current = existing.find((t) => t.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Tag ${id} not found` } };
      }

      const normalised: typeof changes = { ...changes };
      if (normalised.name !== undefined) {
        const trimmed = normalised.name.trim();
        if (trimmed.length === 0) {
          return {
            ok: false,
            error: { code: 'NAME_EMPTY', message: 'Tag name is required', field: 'name' },
          };
        }
        normalised.name = trimmed;
      }
      if (normalised.color !== undefined) {
        const trimmed = normalised.color.trim();
        if (trimmed.length === 0) delete normalised.color;
        else normalised.color = trimmed;
      }

      if (!Object.values(normalised).some((v) => v !== undefined)) {
        return {
          ok: false,
          error: { code: 'SCHEMA_INVALID', message: 'changes must be non-empty' },
        };
      }

      if (normalised.name !== undefined) {
        const clash = existing.some(
          (t) => t.id !== id && t.name.trim().toLowerCase() === normalised.name!.toLowerCase(),
        );
        if (clash) {
          return {
            ok: false,
            error: {
              code: 'NAME_DUPLICATE',
              message: `A tag named "${normalised.name}" already exists`,
              field: 'name',
            },
          };
        }
      }

      const event: ConfigTagUpdatedEvent = {
        type: 'TagUpdated',
        id: deps.newId(),
        tagId: id,
        changes: normalised,
        updatedAt: deps.now().toISOString(),
      };
      await appendAndApply(deps, event);
      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createTagsArchiveHandler(
  deps: TagsHandlerDeps,
): (raw: unknown) => Promise<ArchiveTagResponse> {
  return async function handleTagsArchive(raw: unknown): Promise<ArchiveTagResponse> {
    try {
      const parsed = archiveTagRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id } = parsed.data;
      const current = deps.getReadModel().configTags.find((t) => t.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Tag ${id} not found` } };
      }
      if (current.archivedAt !== undefined) {
        return {
          ok: false,
          error: { code: 'ALREADY_ARCHIVED', message: `Tag ${id} is already archived` },
        };
      }
      const event: ConfigTagArchivedEvent = {
        type: 'TagArchived',
        id: deps.newId(),
        tagId: id,
        archivedAt: deps.now().toISOString(),
      };
      await appendAndApply(deps, event);
      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createTagsUnarchiveHandler(
  deps: TagsHandlerDeps,
): (raw: unknown) => Promise<UnarchiveTagResponse> {
  return async function handleTagsUnarchive(raw: unknown): Promise<UnarchiveTagResponse> {
    try {
      const parsed = unarchiveTagRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id } = parsed.data;
      const current = deps.getReadModel().configTags.find((t) => t.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Tag ${id} not found` } };
      }
      if (current.archivedAt === undefined) {
        return {
          ok: false,
          error: { code: 'NOT_ARCHIVED', message: `Tag ${id} is not archived` },
        };
      }
      const event: ConfigTagUnarchivedEvent = {
        type: 'TagUnarchived',
        id: deps.newId(),
        tagId: id,
        unarchivedAt: deps.now().toISOString(),
      };
      await appendAndApply(deps, event);
      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

// ---------------------------------------------------------------------------
// WI-21-followup — hard-delete (gated on usage_count === 0).
// ---------------------------------------------------------------------------

function countTagUsage(model: ReadModel, tagId: string): number {
  const found = selectTagUsage(model).find((u) => u.tagId === tagId);
  return found?.transactionCount ?? 0;
}

export function createTagsDeleteHandler(
  deps: TagsHandlerDeps,
): (raw: unknown) => Promise<DeleteTagResponse> {
  return async function handleTagsDelete(raw: unknown): Promise<DeleteTagResponse> {
    try {
      const parsed = deleteTagRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id } = parsed.data;
      const model = deps.getReadModel();
      const current = model.configTags.find((t) => t.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Tag ${id} not found` } };
      }
      const transactionCount = countTagUsage(model, id);
      if (transactionCount > 0) {
        return {
          ok: false,
          error: {
            code: 'HAS_REFERENCES',
            message: `Tag ${id} is referenced by ${transactionCount} transaction(s)`,
            transactionCount,
          },
        };
      }
      const event: ConfigTagDeletedEvent = {
        type: 'TagDeleted',
        id: deps.newId(),
        tagId: id,
        deletedAt: deps.now().toISOString(),
      };
      await appendAndApply(deps, event);
      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createTagsUsageHandler(
  deps: Pick<TagsHandlerDeps, 'getReadModel'>,
): () => Promise<TagsUsageResponse> {
  return async function handleTagsUsage(): Promise<TagsUsageResponse> {
    return { usage: selectTagUsage(deps.getReadModel()) };
  };
}
