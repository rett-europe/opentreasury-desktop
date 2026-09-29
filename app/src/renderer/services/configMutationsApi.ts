// WI-21 config CRUD wrappers — thin layer over the `window.opentreasury`
// bridge that maps the main-side `{ ok: true, event } | { ok: false, error }`
// discriminated-union responses to throw-on-error semantics. Callers receive
// `Promise<void>` for update/archive/unarchive and a synthesised
// `SubcategoryRecord` from `createSubcategory`.
//
// Archive state is canonically represented by `archivedAt` (ISO timestamp).
// There is no boolean `archived` flag anywhere in the contracts.
//
// Finding #12 (PR#4 round 2) — the previous version wrapped the bridge in a
// loose `BridgeFn = (req: unknown) => Promise<unknown>` shape and cast the
// result to a hand-rolled `ContractResult`. That pattern hides integration
// drift behind TS casts (see .squad/skills/config-screen-pattern/SKILL.md
// §"IPC service wrappers"). Each wrapper below now imports its contract
// Request/Response pair and types the bridge method explicitly — if the
// preload surface ever drifts from the contract, TypeScript will flag it here
// at the wrapper layer, not inside opaque runtime casts.

import type {
  AccountRecord,
  AccountsUsageResponse,
  ArchiveAccountRequest,
  ArchiveAccountResponse,
  DeleteAccountRequest,
  DeleteAccountResponse,
  UnarchiveAccountRequest,
  UnarchiveAccountResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
} from '../../shared/ipc-contracts/accounts.js';
import type {
  ArchiveCategoryRequest,
  ArchiveCategoryResponse,
  ArchiveSubcategoryRequest,
  ArchiveSubcategoryResponse,
  CategoryKind,
  CategoryRecord,
  CreateSubcategoryRequest,
  CreateSubcategoryResponse,
  DeleteCategoryRequest,
  DeleteCategoryResponse,
  DeleteSubcategoryRequest,
  DeleteSubcategoryResponse,
  SubcategoriesUsageResponse,
  SubcategoryRecord,
  UnarchiveCategoryRequest,
  UnarchiveCategoryResponse,
  UnarchiveSubcategoryRequest,
  UnarchiveSubcategoryResponse,
  UpdateCategoryRequest,
  UpdateCategoryResponse,
  UpdateSubcategoryRequest,
  UpdateSubcategoryResponse,
} from '../../shared/ipc-contracts/categories.js';
import type {
  ArchiveTagRequest,
  ArchiveTagResponse,
  DeleteTagRequest,
  DeleteTagResponse,
  TagRecord,
  TagsUsageResponse,
  UnarchiveTagRequest,
  UnarchiveTagResponse,
  UpdateTagRequest,
  UpdateTagResponse,
} from '../../shared/ipc-contracts/tags.js';

// Re-export so renderer call sites import the contract type from one place.
export type { SubcategoryRecord } from '../../shared/ipc-contracts/categories.js';

// ---------------------------------------------------------------------------
// Local types — archive metadata augments the shared records.
// ---------------------------------------------------------------------------

export interface ArchivableMeta {
  readonly archivedAt?: string | undefined;
}

export type ConfigAccount = AccountRecord & ArchivableMeta;
export type ConfigCategory = CategoryRecord & ArchivableMeta;
export type ConfigTag = TagRecord & ArchivableMeta;

export function isArchived(record: ArchivableMeta | null | undefined): boolean {
  return record?.archivedAt !== undefined && record.archivedAt !== null;
}

// ---------------------------------------------------------------------------
// Update / archive / unarchive change shapes
// ---------------------------------------------------------------------------

// Opening balance is editable post-creation (trial.3.13). Pedro's real use
// case is fixing an opening balance that was wrong at account-creation time
// for an account that already has transactions; the modal guards the shift
// behind a confirm dialog when usage_count > 0 and the handler no-op-strips
// when the new value matches the current.
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
  readonly isInternalTransfer?: boolean | undefined;
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
// Bridge access — typed per-method against the actual contract Request/Response
// pairs. Each bridge accessor narrows `window.opentreasury` to exactly the
// method it needs (no `any`, no broad `unknown` casts).
// ---------------------------------------------------------------------------

type MethodBridge<Req, Res> = (req: Req) => Promise<Res>;

interface OpenTreasurySurface {
  readonly accounts?: {
    readonly update?: MethodBridge<UpdateAccountRequest, UpdateAccountResponse>;
    readonly archive?: MethodBridge<ArchiveAccountRequest, ArchiveAccountResponse>;
    readonly unarchive?: MethodBridge<UnarchiveAccountRequest, UnarchiveAccountResponse>;
    readonly delete?: MethodBridge<DeleteAccountRequest, DeleteAccountResponse>;
    readonly usage?: () => Promise<AccountsUsageResponse>;
  };
  readonly categories?: {
    readonly update?: MethodBridge<UpdateCategoryRequest, UpdateCategoryResponse>;
    readonly archive?: MethodBridge<ArchiveCategoryRequest, ArchiveCategoryResponse>;
    readonly unarchive?: MethodBridge<UnarchiveCategoryRequest, UnarchiveCategoryResponse>;
    readonly delete?: MethodBridge<DeleteCategoryRequest, DeleteCategoryResponse>;
    readonly subcategory?: {
      readonly create?: MethodBridge<CreateSubcategoryRequest, CreateSubcategoryResponse>;
      readonly update?: MethodBridge<UpdateSubcategoryRequest, UpdateSubcategoryResponse>;
      readonly archive?: MethodBridge<ArchiveSubcategoryRequest, ArchiveSubcategoryResponse>;
      readonly unarchive?: MethodBridge<UnarchiveSubcategoryRequest, UnarchiveSubcategoryResponse>;
      readonly delete?: MethodBridge<DeleteSubcategoryRequest, DeleteSubcategoryResponse>;
      readonly usage?: () => Promise<SubcategoriesUsageResponse>;
    };
  };
  readonly tags?: {
    readonly update?: MethodBridge<UpdateTagRequest, UpdateTagResponse>;
    readonly archive?: MethodBridge<ArchiveTagRequest, ArchiveTagResponse>;
    readonly unarchive?: MethodBridge<UnarchiveTagRequest, UnarchiveTagResponse>;
    readonly delete?: MethodBridge<DeleteTagRequest, DeleteTagResponse>;
    readonly usage?: () => Promise<TagsUsageResponse>;
  };
}

function surface(): OpenTreasurySurface {
  const raw = (window as unknown as { opentreasury?: OpenTreasurySurface }).opentreasury;
  return raw ?? {};
}

// Every mutation response is `{ ok: true, event } | { ok: false, error }`.
interface ContractError {
  readonly code: string;
  readonly message: string;
  readonly field?: string | undefined;
  // WI-21-followup — populated on HAS_REFERENCES errors so the UI can
  // render "X transactions reference this …".
  readonly transactionCount?: number | undefined;
}

type MutationResponse<Ev> =
  | { readonly ok: true; readonly event: Ev }
  | { readonly ok: false; readonly error: ContractError };

/** Custom error carrying the contract error code so callers can branch on it. */
export class ConfigMutationError extends Error {
  public readonly code: string;
  public readonly field: string | undefined;
  // WI-21-followup — only populated when `code === 'HAS_REFERENCES'`.
  public readonly transactionCount: number | undefined;
  public constructor(error: ContractError) {
    super(error.message);
    this.name = 'ConfigMutationError';
    this.code = error.code;
    this.field = error.field;
    this.transactionCount = error.transactionCount;
  }
}

/**
 * Invoke a typed bridge method. Narrows the discriminated-union response to
 * the success branch on `ok: true` and throws a ConfigMutationError on
 * `ok: false`. Each call site passes a bridge method whose signature already
 * matches the contract Request/Response pair — no casts required.
 */
async function invokeTyped<Req, Ev>(
  fn: MethodBridge<Req, MutationResponse<Ev>> | undefined,
  channel: string,
  req: Req,
): Promise<Ev> {
  if (!fn) {
    throw new Error(`preload method "${channel}" is not exposed on window.opentreasury`);
  }
  const result = await fn(req);
  if (!result.ok) {
    throw new ConfigMutationError(result.error);
  }
  return result.event;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function updateAccount(id: string, changes: UpdateAccountChanges): Promise<void> {
  await invokeTyped(surface().accounts?.update, 'accounts.update', {
    id,
    changes,
  } as UpdateAccountRequest);
}

export async function archiveAccount(id: string): Promise<void> {
  await invokeTyped(surface().accounts?.archive, 'accounts.archive', { id });
}

export async function unarchiveAccount(id: string): Promise<void> {
  await invokeTyped(surface().accounts?.unarchive, 'accounts.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function updateCategory(id: string, changes: UpdateCategoryChanges): Promise<void> {
  await invokeTyped(surface().categories?.update, 'categories.update', {
    id,
    changes,
  } as UpdateCategoryRequest);
}

export async function archiveCategory(id: string): Promise<void> {
  await invokeTyped(surface().categories?.archive, 'categories.archive', { id });
}

export async function unarchiveCategory(id: string): Promise<void> {
  await invokeTyped(surface().categories?.unarchive, 'categories.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function updateTag(id: string, changes: UpdateTagChanges): Promise<void> {
  await invokeTyped(surface().tags?.update, 'tags.update', {
    id,
    changes,
  } as UpdateTagRequest);
}

export async function archiveTag(id: string): Promise<void> {
  await invokeTyped(surface().tags?.archive, 'tags.archive', { id });
}

export async function unarchiveTag(id: string): Promise<void> {
  await invokeTyped(surface().tags?.unarchive, 'tags.unarchive', { id });
}

// ---------------------------------------------------------------------------
// Subcategories — nested under `categories.subcategory.*` on the preload.
// There is no `list` method; subcategories are inlined on
// `CategoryRecord.subcategories[]` from `categories:list`.
// ---------------------------------------------------------------------------

export async function createSubcategory(
  parentCategoryId: string,
  name: string,
): Promise<SubcategoryRecord> {
  const event = await invokeTyped(
    surface().categories?.subcategory?.create,
    'categories.subcategory.create',
    { parentCategoryId, name } satisfies CreateSubcategoryRequest,
  );
  return {
    id: event.id,
    parentCategoryId: event.parentCategoryId,
    name: event.name,
    createdAt: event.createdAt,
    ...(event.color !== undefined ? { color: event.color } : {}),
  };
}

export async function updateSubcategory(
  id: string,
  parentCategoryId: string,
  changes: UpdateSubcategoryChanges,
): Promise<void> {
  await invokeTyped(surface().categories?.subcategory?.update, 'categories.subcategory.update', {
    id,
    parentCategoryId,
    changes,
  } as UpdateSubcategoryRequest);
}

export async function archiveSubcategory(id: string, parentCategoryId: string): Promise<void> {
  await invokeTyped(surface().categories?.subcategory?.archive, 'categories.subcategory.archive', {
    id,
    parentCategoryId,
  });
}

export async function unarchiveSubcategory(id: string, parentCategoryId: string): Promise<void> {
  await invokeTyped(
    surface().categories?.subcategory?.unarchive,
    'categories.subcategory.unarchive',
    { id, parentCategoryId },
  );
}

// ---------------------------------------------------------------------------
// WI-21-followup — hard-delete + usage helpers. Each delete unwraps the
// discriminated union and throws ConfigMutationError on failure; the renderer
// branches on `err.code === 'HAS_REFERENCES'` and reads `err.transactionCount`
// to render the helpful "X transactions reference this entity" message.
// ---------------------------------------------------------------------------

export async function deleteAccount(id: string): Promise<void> {
  await invokeTyped(surface().accounts?.delete, 'accounts.delete', { id });
}

export async function deleteCategory(id: string): Promise<void> {
  await invokeTyped(surface().categories?.delete, 'categories.delete', { id });
}

export async function deleteSubcategory(params: {
  readonly id: string;
  readonly parentId: string;
}): Promise<void> {
  await invokeTyped(surface().categories?.subcategory?.delete, 'categories.subcategory.delete', {
    id: params.id,
    parentCategoryId: params.parentId,
  });
}

export async function deleteTag(id: string): Promise<void> {
  await invokeTyped(surface().tags?.delete, 'tags.delete', { id });
}

// Usage list IPCs — used by the UI to gate the Delete button per row.

export async function listAccountsUsage(): Promise<AccountsUsageResponse> {
  const fn = surface().accounts?.usage;
  if (!fn) {
    throw new Error('preload method "accounts.usage" is not exposed on window.opentreasury');
  }
  return fn();
}

export async function listSubcategoriesUsage(): Promise<SubcategoriesUsageResponse> {
  const fn = surface().categories?.subcategory?.usage;
  if (!fn) {
    throw new Error(
      'preload method "categories.subcategory.usage" is not exposed on window.opentreasury',
    );
  }
  return fn();
}

export async function listTagsUsage(): Promise<TagsUsageResponse> {
  const fn = surface().tags?.usage;
  if (!fn) {
    throw new Error('preload method "tags.usage" is not exposed on window.opentreasury');
  }
  return fn();
}
