// WI-21 config CRUD wrappers — thin layer over the `window.opentreasury`
// bridge that maps the main-side `{ ok: true, event } | { ok: false, error }`
// discriminated-union responses to throw-on-error semantics. Callers receive
// `Promise<void>` for update/archive/unarchive and a synthesised
// `SubcategoryRecord` from `createSubcategory`.
//
// Archive state is canonically represented by `archivedAt` (ISO timestamp).
// There is no boolean `archived` flag anywhere in the contracts.

import type { AccountRecord } from '../../shared/ipc-contracts/accounts.js';
import type { CategoryKind, CategoryRecord } from '../../shared/ipc-contracts/categories.js';
import type { TagRecord } from '../../shared/ipc-contracts/tags.js';

// ---------------------------------------------------------------------------
// Local types — archive metadata augments the shared records; the subcategory
// record is a renderer-side mirror of the inlined `CategoryRecord.subcategories[]`
// shape (see app/src/shared/ipc-contracts/categories.ts → subcategoryRecordSchema).
// ---------------------------------------------------------------------------

export interface ArchivableMeta {
  readonly archivedAt?: string;
}

export type ConfigAccount = AccountRecord & ArchivableMeta;
export type ConfigCategory = CategoryRecord & ArchivableMeta;
export type ConfigTag = TagRecord & ArchivableMeta;

export interface SubcategoryRecord extends ArchivableMeta {
  readonly id: string;
  readonly parentCategoryId: string;
  readonly name: string;
  readonly color?: string;
  readonly createdAt: string;
}

export function isArchived(record: ArchivableMeta | null | undefined): boolean {
  return record?.archivedAt !== undefined && record.archivedAt !== null;
}

// ---------------------------------------------------------------------------
// Update / archive / unarchive change shapes
// ---------------------------------------------------------------------------

// NOTE: openingBalance is intentionally omitted. Accounts are event-sourced;
// the genesis opening balance is immutable — mutating it would corrupt the
// reconstructed balance history.
export interface UpdateAccountChanges {
  readonly name?: string | undefined;
  readonly bankName?: string | undefined;
  readonly label?: string | undefined;
  readonly iban?: string | undefined;
  readonly color?: string | undefined;
  readonly isPaypal?: boolean | undefined;
}

export interface UpdateCategoryChanges {
  readonly name?: string | undefined;
  readonly color?: string | undefined;
  readonly kind?: CategoryKind | undefined;
}

export interface UpdateTagChanges {
  readonly name?: string | undefined;
  readonly color?: string | undefined;
}

export interface UpdateSubcategoryChanges {
  readonly name?: string | undefined;
  readonly color?: string | undefined;
}

// ---------------------------------------------------------------------------
// Bridge access — typed against the actual `window.opentreasury` surface.
// ---------------------------------------------------------------------------

type BridgeFn = (req: unknown) => Promise<unknown>;

interface LooseBridge {
  readonly accounts?: {
    readonly update?: BridgeFn;
    readonly archive?: BridgeFn;
    readonly unarchive?: BridgeFn;
  };
  readonly categories?: {
    readonly update?: BridgeFn;
    readonly archive?: BridgeFn;
    readonly unarchive?: BridgeFn;
    readonly subcategory?: {
      readonly create?: BridgeFn;
      readonly update?: BridgeFn;
      readonly archive?: BridgeFn;
      readonly unarchive?: BridgeFn;
    };
  };
  readonly tags?: {
    readonly update?: BridgeFn;
    readonly archive?: BridgeFn;
    readonly unarchive?: BridgeFn;
  };
}

function bridge(): LooseBridge {
  return ((window as unknown as { opentreasury?: LooseBridge }).opentreasury ?? {}) as LooseBridge;
}

interface ContractError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

type ContractResult =
  | { readonly ok: true; readonly event: unknown }
  | { readonly ok: false; readonly error: ContractError };

/** Custom error carrying the contract error code so callers can branch on it. */
export class ConfigMutationError extends Error {
  public readonly code: string;
  public readonly field: string | undefined;
  public constructor(error: ContractError) {
    super(error.message);
    this.name = 'ConfigMutationError';
    this.code = error.code;
    this.field = error.field;
  }
}

async function invoke(
  fn: BridgeFn | undefined,
  channel: string,
  req: unknown,
): Promise<{ readonly event: unknown }> {
  if (!fn) {
    throw new Error(`preload method "${channel}" is not exposed on window.opentreasury`);
  }
  const result = (await fn(req)) as ContractResult;
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error(`unexpected response shape from "${channel}"`);
  }
  if (!result.ok) {
    throw new ConfigMutationError(result.error);
  }
  return { event: result.event };
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function updateAccount(id: string, changes: UpdateAccountChanges): Promise<void> {
  await invoke(bridge().accounts?.update, 'accounts.update', { id, changes });
}

export async function archiveAccount(id: string): Promise<void> {
  await invoke(bridge().accounts?.archive, 'accounts.archive', { id });
}

export async function unarchiveAccount(id: string): Promise<void> {
  await invoke(bridge().accounts?.unarchive, 'accounts.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function updateCategory(id: string, changes: UpdateCategoryChanges): Promise<void> {
  await invoke(bridge().categories?.update, 'categories.update', { id, changes });
}

export async function archiveCategory(id: string): Promise<void> {
  await invoke(bridge().categories?.archive, 'categories.archive', { id });
}

export async function unarchiveCategory(id: string): Promise<void> {
  await invoke(bridge().categories?.unarchive, 'categories.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function updateTag(id: string, changes: UpdateTagChanges): Promise<void> {
  await invoke(bridge().tags?.update, 'tags.update', { id, changes });
}

export async function archiveTag(id: string): Promise<void> {
  await invoke(bridge().tags?.archive, 'tags.archive', { id });
}

export async function unarchiveTag(id: string): Promise<void> {
  await invoke(bridge().tags?.unarchive, 'tags.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Subcategories — nested under `categories.subcategory.*` on the preload.
// There is no `list` method; subcategories are inlined on
// `CategoryRecord.subcategories[]` from `categories:list`.
// ---------------------------------------------------------------------------

interface SubcategoryCreatedEventShape {
  readonly id: string;
  readonly parentCategoryId: string;
  readonly name: string;
  readonly color?: string;
  readonly createdAt: string;
}

export async function createSubcategory(
  parentCategoryId: string,
  name: string,
): Promise<SubcategoryRecord> {
  const { event } = await invoke(
    bridge().categories?.subcategory?.create,
    'categories.subcategory.create',
    { parentCategoryId, name },
  );
  const ev = event as SubcategoryCreatedEventShape;
  return {
    id: ev.id,
    parentCategoryId: ev.parentCategoryId,
    name: ev.name,
    createdAt: ev.createdAt,
    ...(ev.color !== undefined ? { color: ev.color } : {}),
  };
}

export async function updateSubcategory(
  id: string,
  parentCategoryId: string,
  changes: UpdateSubcategoryChanges,
): Promise<void> {
  await invoke(bridge().categories?.subcategory?.update, 'categories.subcategory.update', {
    id,
    parentCategoryId,
    changes,
  });
}

export async function archiveSubcategory(id: string, parentCategoryId: string): Promise<void> {
  await invoke(bridge().categories?.subcategory?.archive, 'categories.subcategory.archive', {
    id,
    parentCategoryId,
  });
}

export async function unarchiveSubcategory(id: string, parentCategoryId: string): Promise<void> {
  await invoke(bridge().categories?.subcategory?.unarchive, 'categories.subcategory.unarchive', {
    id,
    parentCategoryId,
  });
}
