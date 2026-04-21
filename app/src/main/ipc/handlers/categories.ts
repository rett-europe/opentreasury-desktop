// categories:create + categories:list IPC handler factories — WI-15-lite.
//
// Mirrors the accounts handler. Categories carry an optional `kind`
// (income|expense) per the 2026-04-22 prototype update; subcategories
// are still deferred to a follow-up slice.

import type { EventLog } from '../../../core/eventLog/index.js';
import type { ConfigCategoryCreatedEvent } from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  createCategoryRequestSchema,
  type CategoryRecord,
  type CreateCategoryResponse,
} from '../../../shared/ipc-contracts/categories.js';
import { selectCategories } from '../../projections/config.js';

export interface CategoriesHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly applyEvent?: typeof coreApplyEvent;
}

export function createCategoriesCreateHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<CreateCategoryResponse> {
  const apply = deps.applyEvent ?? coreApplyEvent;

  return async function handleCategoriesCreate(raw: unknown): Promise<CreateCategoryResponse> {
    try {
      const parsed = createCategoryRequestSchema.safeParse(raw);
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
          error: { code: 'NAME_EMPTY', message: 'Category name is required', field: 'name' },
        };
      }

      const existing = deps.getReadModel().configCategories;
      const clash = existing.some((c) => c.name.trim().toLowerCase() === name.toLowerCase());
      if (clash) {
        return {
          ok: false,
          error: {
            code: 'NAME_DUPLICATE',
            message: `A category named "${name}" already exists`,
            field: 'name',
          },
        };
      }

      const color = parsed.data.color?.trim();
      const kind = parsed.data.kind;
      const event: ConfigCategoryCreatedEvent = {
        type: 'CategoryCreated',
        id: deps.newId(),
        name,
        createdAt: deps.now().toISOString(),
        ...(color !== undefined && color.length > 0 ? { color } : {}),
        ...(kind !== undefined ? { kind } : {}),
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

export function createCategoriesListHandler(
  deps: Pick<CategoriesHandlerDeps, 'getReadModel'>,
): () => Promise<{ categories: CategoryRecord[] }> {
  return async function handleCategoriesList(): Promise<{ categories: CategoryRecord[] }> {
    return { categories: selectCategories(deps.getReadModel()) };
  };
}
