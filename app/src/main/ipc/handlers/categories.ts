// categories:* and subcategories:* IPC handler factories — WI-15-lite + WI-21.
//
// Event-sourced CRUD (archive-only per Switch's WI-21 ruling; NO hard-delete).
// Categories now support update/archive/unarchive. Subcategories get the
// full lifecycle (create/update/archive/unarchive) — their events are
// first-class on the NDJSON log but the projection inlines them under the
// parent `ConfigCategory.subcategories` (see decisions drop file).

import type { EventLog } from '../../../core/eventLog/index.js';
import type {
  ConfigCategoryArchivedEvent,
  ConfigCategoryCreatedEvent,
  ConfigCategoryUnarchivedEvent,
  ConfigCategoryUpdatedEvent,
  ConfigSubcategoryArchivedEvent,
  ConfigSubcategoryCreatedEvent,
  ConfigSubcategoryUnarchivedEvent,
  ConfigSubcategoryUpdatedEvent,
} from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  archiveCategoryRequestSchema,
  archiveSubcategoryRequestSchema,
  createCategoryRequestSchema,
  createSubcategoryRequestSchema,
  unarchiveCategoryRequestSchema,
  unarchiveSubcategoryRequestSchema,
  updateCategoryRequestSchema,
  updateSubcategoryRequestSchema,
  type ArchiveCategoryResponse,
  type ArchiveSubcategoryResponse,
  type CategoryRecord,
  type CreateCategoryResponse,
  type CreateSubcategoryResponse,
  type UnarchiveCategoryResponse,
  type UnarchiveSubcategoryResponse,
  type UpdateCategoryResponse,
  type UpdateSubcategoryResponse,
} from '../../../shared/ipc-contracts/categories.js';
import { selectActiveCategories, selectCategories } from '../../projections/config.js';

export interface CategoriesHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly applyEvent?: typeof coreApplyEvent;
}

async function appendAndApply(
  deps: CategoriesHandlerDeps,
  event: Parameters<typeof coreApplyEvent>[0],
): Promise<void> {
  const apply = deps.applyEvent ?? coreApplyEvent;
  const before = (await deps.eventLog.load()).length;
  await deps.eventLog.append(event);
  const after = (await deps.eventLog.load()).length;
  if (after > before) {
    apply(event);
  }
}

export function createCategoriesCreateHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<CreateCategoryResponse> {
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

      await appendAndApply(deps, event);

      return { ok: true, event };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', message } };
    }
  };
}

export function createCategoriesListHandler(
  deps: Pick<CategoriesHandlerDeps, 'getReadModel'>,
): (raw?: unknown) => Promise<{ categories: CategoryRecord[] }> {
  return async function handleCategoriesList(
    raw?: unknown,
  ): Promise<{ categories: CategoryRecord[] }> {
    const includeArchived =
      typeof raw === 'object' &&
      raw !== null &&
      'includeArchived' in raw &&
      (raw as { includeArchived?: unknown }).includeArchived === true;
    const model = deps.getReadModel();
    return {
      categories: includeArchived ? selectCategories(model) : selectActiveCategories(model),
    };
  };
}

export function createCategoriesUpdateHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<UpdateCategoryResponse> {
  return async function handleCategoriesUpdate(raw: unknown): Promise<UpdateCategoryResponse> {
    try {
      const parsed = updateCategoryRequestSchema.safeParse(raw);
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
      const existing = deps.getReadModel().configCategories;
      const current = existing.find((c) => c.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Category ${id} not found` } };
      }

      const normalised: typeof changes = { ...changes };
      if (normalised.name !== undefined) {
        const trimmed = normalised.name.trim();
        if (trimmed.length === 0) {
          return {
            ok: false,
            error: { code: 'NAME_EMPTY', message: 'Category name is required', field: 'name' },
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
          (c) => c.id !== id && c.name.trim().toLowerCase() === normalised.name!.toLowerCase(),
        );
        if (clash) {
          return {
            ok: false,
            error: {
              code: 'NAME_DUPLICATE',
              message: `A category named "${normalised.name}" already exists`,
              field: 'name',
            },
          };
        }
      }

      const event: ConfigCategoryUpdatedEvent = {
        type: 'CategoryUpdated',
        id: deps.newId(),
        categoryId: id,
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

export function createCategoriesArchiveHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<ArchiveCategoryResponse> {
  return async function handleCategoriesArchive(raw: unknown): Promise<ArchiveCategoryResponse> {
    try {
      const parsed = archiveCategoryRequestSchema.safeParse(raw);
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
      const current = deps.getReadModel().configCategories.find((c) => c.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Category ${id} not found` } };
      }
      if (current.archivedAt !== undefined) {
        return {
          ok: false,
          error: { code: 'ALREADY_ARCHIVED', message: `Category ${id} is already archived` },
        };
      }
      const event: ConfigCategoryArchivedEvent = {
        type: 'CategoryArchived',
        id: deps.newId(),
        categoryId: id,
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

export function createCategoriesUnarchiveHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<UnarchiveCategoryResponse> {
  return async function handleCategoriesUnarchive(
    raw: unknown,
  ): Promise<UnarchiveCategoryResponse> {
    try {
      const parsed = unarchiveCategoryRequestSchema.safeParse(raw);
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
      const current = deps.getReadModel().configCategories.find((c) => c.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Category ${id} not found` } };
      }
      if (current.archivedAt === undefined) {
        return {
          ok: false,
          error: { code: 'NOT_ARCHIVED', message: `Category ${id} is not archived` },
        };
      }
      const event: ConfigCategoryUnarchivedEvent = {
        type: 'CategoryUnarchived',
        id: deps.newId(),
        categoryId: id,
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
// Subcategory handlers
// ---------------------------------------------------------------------------

export function createSubcategoriesCreateHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<CreateSubcategoryResponse> {
  return async function handleSubcategoriesCreate(
    raw: unknown,
  ): Promise<CreateSubcategoryResponse> {
    try {
      const parsed = createSubcategoryRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { parentCategoryId } = parsed.data;
      const name = parsed.data.name.trim();
      if (name.length === 0) {
        return {
          ok: false,
          error: { code: 'NAME_EMPTY', message: 'Subcategory name is required', field: 'name' },
        };
      }
      const parent = deps.getReadModel().configCategories.find((c) => c.id === parentCategoryId);
      if (!parent) {
        return {
          ok: false,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent category ${parentCategoryId} not found`,
            field: 'parentCategoryId',
          },
        };
      }
      // Uniqueness is scoped to the parent category — two parents can each
      // have a subcategory named "General" without colliding.
      const clash = parent.subcategories.some(
        (s) => s.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (clash) {
        return {
          ok: false,
          error: {
            code: 'NAME_DUPLICATE',
            message: `A subcategory named "${name}" already exists in this category`,
            field: 'name',
          },
        };
      }

      const color = parsed.data.color?.trim();
      const event: ConfigSubcategoryCreatedEvent = {
        type: 'SubcategoryCreated',
        id: deps.newId(),
        parentCategoryId,
        name,
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

export function createSubcategoriesUpdateHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<UpdateSubcategoryResponse> {
  return async function handleSubcategoriesUpdate(
    raw: unknown,
  ): Promise<UpdateSubcategoryResponse> {
    try {
      const parsed = updateSubcategoryRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id, parentCategoryId, changes } = parsed.data;
      const parent = deps.getReadModel().configCategories.find((c) => c.id === parentCategoryId);
      if (!parent) {
        return {
          ok: false,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent category ${parentCategoryId} not found`,
          },
        };
      }
      const current = parent.subcategories.find((s) => s.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Subcategory ${id} not found` } };
      }

      const normalised: typeof changes = { ...changes };
      if (normalised.name !== undefined) {
        const trimmed = normalised.name.trim();
        if (trimmed.length === 0) {
          return {
            ok: false,
            error: { code: 'NAME_EMPTY', message: 'Subcategory name is required', field: 'name' },
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
        const clash = parent.subcategories.some(
          (s) => s.id !== id && s.name.trim().toLowerCase() === normalised.name!.toLowerCase(),
        );
        if (clash) {
          return {
            ok: false,
            error: {
              code: 'NAME_DUPLICATE',
              message: `A subcategory named "${normalised.name}" already exists in this category`,
              field: 'name',
            },
          };
        }
      }

      const event: ConfigSubcategoryUpdatedEvent = {
        type: 'SubcategoryUpdated',
        id: deps.newId(),
        subcategoryId: id,
        parentCategoryId,
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

export function createSubcategoriesArchiveHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<ArchiveSubcategoryResponse> {
  return async function handleSubcategoriesArchive(
    raw: unknown,
  ): Promise<ArchiveSubcategoryResponse> {
    try {
      const parsed = archiveSubcategoryRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id, parentCategoryId } = parsed.data;
      const parent = deps.getReadModel().configCategories.find((c) => c.id === parentCategoryId);
      if (!parent) {
        return {
          ok: false,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent category ${parentCategoryId} not found`,
          },
        };
      }
      const current = parent.subcategories.find((s) => s.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Subcategory ${id} not found` } };
      }
      if (current.archivedAt !== undefined) {
        return {
          ok: false,
          error: { code: 'ALREADY_ARCHIVED', message: `Subcategory ${id} is already archived` },
        };
      }
      const event: ConfigSubcategoryArchivedEvent = {
        type: 'SubcategoryArchived',
        id: deps.newId(),
        subcategoryId: id,
        parentCategoryId,
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

export function createSubcategoriesUnarchiveHandler(
  deps: CategoriesHandlerDeps,
): (raw: unknown) => Promise<UnarchiveSubcategoryResponse> {
  return async function handleSubcategoriesUnarchive(
    raw: unknown,
  ): Promise<UnarchiveSubcategoryResponse> {
    try {
      const parsed = unarchiveSubcategoryRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }
      const { id, parentCategoryId } = parsed.data;
      const parent = deps.getReadModel().configCategories.find((c) => c.id === parentCategoryId);
      if (!parent) {
        return {
          ok: false,
          error: {
            code: 'PARENT_NOT_FOUND',
            message: `Parent category ${parentCategoryId} not found`,
          },
        };
      }
      const current = parent.subcategories.find((s) => s.id === id);
      if (!current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: `Subcategory ${id} not found` } };
      }
      if (current.archivedAt === undefined) {
        return {
          ok: false,
          error: { code: 'NOT_ARCHIVED', message: `Subcategory ${id} is not archived` },
        };
      }
      const event: ConfigSubcategoryUnarchivedEvent = {
        type: 'SubcategoryUnarchived',
        id: deps.newId(),
        subcategoryId: id,
        parentCategoryId,
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
