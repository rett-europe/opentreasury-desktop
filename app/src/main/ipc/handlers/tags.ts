// tags:create + tags:list IPC handler factories — WI-15-lite.

import type { EventLog } from '../../../core/eventLog/index.js';
import type { ConfigTagCreatedEvent } from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  createTagRequestSchema,
  type TagRecord,
  type CreateTagResponse,
} from '../../../shared/ipc-contracts/tags.js';
import { selectTags } from '../../projections/config.js';

export interface TagsHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly applyEvent?: typeof coreApplyEvent;
}

export function createTagsCreateHandler(
  deps: TagsHandlerDeps,
): (raw: unknown) => Promise<CreateTagResponse> {
  const apply = deps.applyEvent ?? coreApplyEvent;

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

      const event: ConfigTagCreatedEvent = {
        type: 'TagCreated',
        id: deps.newId(),
        name,
        createdAt: deps.now().toISOString(),
      };

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(event);
      const after = (await deps.eventLog.load()).length;
      if (after > before) {
        apply(event);
      }

      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createTagsListHandler(
  deps: Pick<TagsHandlerDeps, 'getReadModel'>,
): () => Promise<{ tags: TagRecord[] }> {
  return async function handleTagsList(): Promise<{ tags: TagRecord[] }> {
    return { tags: selectTags(deps.getReadModel()) };
  };
}
