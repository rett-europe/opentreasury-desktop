// Config mutations API — renderer-side wrappers for WI-21 CRUD (update/archive/unarchive).
//
// Morpheus owns the main-side IPC contracts + preload bridge. Until those land
// (decisions/inbox/morpheus-wi21-events-ipc.md), these calls detect the bridge
// methods at runtime and throw a clear TODO error if they are missing, so the
// UI can surface a toast rather than crash.
//
// TODO(morpheus): once `config.{entity}.{update,archive,unarchive}` channels ship,
// type these helpers via the Zod contracts and drop the runtime guards.

import type { AccountRecord } from '../../shared/ipc-contracts/accounts.js';
import type { CategoryKind, CategoryRecord } from '../../shared/ipc-contracts/categories.js';
import type { TagRecord } from '../../shared/ipc-contracts/tags.js';

// ---------------------------------------------------------------------------
// Local types — the shared contracts don't (yet) carry archive metadata or a
// subcategory record. Trinity keeps these renderer-local until Morpheus extends
// the contracts.
// ---------------------------------------------------------------------------

export interface ArchivableMeta {
  readonly archived?: boolean;
  readonly archivedAt?: string;
}

export type ConfigAccount = AccountRecord & ArchivableMeta;
export type ConfigCategory = CategoryRecord & ArchivableMeta;
export type ConfigTag = TagRecord & ArchivableMeta;

export interface SubcategoryRecord extends ArchivableMeta {
  readonly id: string;
  readonly parentCategoryId: string;
  readonly name: string;
  readonly createdAt: string;
}

export function isArchived(record: ArchivableMeta | null | undefined): boolean {
  return Boolean(record?.archived);
}

// ---------------------------------------------------------------------------
// Update / archive / unarchive shapes
// ---------------------------------------------------------------------------

export interface UpdateAccountChanges {
  readonly name?: string | undefined;
  readonly bankName?: string | undefined;
  readonly label?: string | undefined;
  readonly iban?: string | undefined;
  readonly color?: string | undefined;
  readonly isPaypal?: boolean | undefined;
  readonly openingBalance?: number | undefined;
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
}

// ---------------------------------------------------------------------------
// Runtime bridge detection
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
  };
  readonly tags?: {
    readonly update?: BridgeFn;
    readonly archive?: BridgeFn;
    readonly unarchive?: BridgeFn;
  };
  readonly subcategories?: {
    readonly list?: BridgeFn;
    readonly create?: BridgeFn;
    readonly update?: BridgeFn;
    readonly archive?: BridgeFn;
    readonly unarchive?: BridgeFn;
  };
}

function bridge(): LooseBridge {
  return ((window as unknown as { opentreasury?: LooseBridge }).opentreasury ?? {}) as LooseBridge;
}

function notWired(channel: string): never {
  throw new Error(`TODO(morpheus): IPC channel "${channel}" is not wired yet (WI-21)`);
}

async function call(fn: BridgeFn | undefined, channel: string, req: unknown): Promise<unknown> {
  if (!fn) notWired(channel);
  return fn(req);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function updateAccount(
  id: string,
  changes: UpdateAccountChanges,
): Promise<ConfigAccount> {
  const result = (await call(bridge().accounts?.update, 'config.account.update', {
    id,
    changes,
  })) as { readonly account: ConfigAccount } | ConfigAccount;
  return 'account' in (result as object)
    ? (result as { readonly account: ConfigAccount }).account
    : (result as ConfigAccount);
}

export async function archiveAccount(id: string): Promise<void> {
  await call(bridge().accounts?.archive, 'config.account.archive', { id });
}

export async function unarchiveAccount(id: string): Promise<void> {
  await call(bridge().accounts?.unarchive, 'config.account.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function updateCategory(
  id: string,
  changes: UpdateCategoryChanges,
): Promise<ConfigCategory> {
  const result = (await call(bridge().categories?.update, 'config.category.update', {
    id,
    changes,
  })) as { readonly category: ConfigCategory } | ConfigCategory;
  return 'category' in (result as object)
    ? (result as { readonly category: ConfigCategory }).category
    : (result as ConfigCategory);
}

export async function archiveCategory(id: string): Promise<void> {
  await call(bridge().categories?.archive, 'config.category.archive', { id });
}

export async function unarchiveCategory(id: string): Promise<void> {
  await call(bridge().categories?.unarchive, 'config.category.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function updateTag(id: string, changes: UpdateTagChanges): Promise<ConfigTag> {
  const result = (await call(bridge().tags?.update, 'config.tag.update', { id, changes })) as
    | { readonly tag: ConfigTag }
    | ConfigTag;
  return 'tag' in (result as object)
    ? (result as { readonly tag: ConfigTag }).tag
    : (result as ConfigTag);
}

export async function archiveTag(id: string): Promise<void> {
  await call(bridge().tags?.archive, 'config.tag.archive', { id });
}

export async function unarchiveTag(id: string): Promise<void> {
  await call(bridge().tags?.unarchive, 'config.tag.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Subcategories
// ---------------------------------------------------------------------------

export async function listSubcategories(parentCategoryId: string): Promise<SubcategoryRecord[]> {
  const fn = bridge().subcategories?.list;
  if (!fn) return [];
  const result = (await fn({ parentCategoryId })) as
    | { readonly subcategories: readonly SubcategoryRecord[] }
    | readonly SubcategoryRecord[];
  if (Array.isArray(result)) return [...result];
  return [...(result as { readonly subcategories: readonly SubcategoryRecord[] }).subcategories];
}

export async function createSubcategory(
  parentCategoryId: string,
  name: string,
): Promise<SubcategoryRecord> {
  const result = (await call(bridge().subcategories?.create, 'config.subcategory.create', {
    parentCategoryId,
    name,
  })) as { readonly subcategory: SubcategoryRecord } | SubcategoryRecord;
  return 'subcategory' in (result as object)
    ? (result as { readonly subcategory: SubcategoryRecord }).subcategory
    : (result as SubcategoryRecord);
}

export async function updateSubcategory(
  id: string,
  parentCategoryId: string,
  changes: UpdateSubcategoryChanges,
): Promise<SubcategoryRecord> {
  const result = (await call(bridge().subcategories?.update, 'config.subcategory.update', {
    id,
    parentCategoryId,
    changes,
  })) as { readonly subcategory: SubcategoryRecord } | SubcategoryRecord;
  return 'subcategory' in (result as object)
    ? (result as { readonly subcategory: SubcategoryRecord }).subcategory
    : (result as SubcategoryRecord);
}

export async function archiveSubcategory(id: string, parentCategoryId: string): Promise<void> {
  await call(bridge().subcategories?.archive, 'config.subcategory.archive', {
    id,
    parentCategoryId,
  });
}

export async function unarchiveSubcategory(id: string, parentCategoryId: string): Promise<void> {
  await call(bridge().subcategories?.unarchive, 'config.subcategory.unarchive', {
    id,
    parentCategoryId,
  });
}
