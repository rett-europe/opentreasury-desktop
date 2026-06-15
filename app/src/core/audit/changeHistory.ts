// SPEC-028 WI-4 (#360) — Change-history projection (pure, main-process only).
//
// Projects the decrypted domain event log into the "Historial de cambios" lane
// view-model. This is the NORMATIVE home of the spec §3.4 "attribution honesty
// gap": the projection MUST NOT render an actor or device it cannot source, and
// MUST NEVER infer one from the session/device currently unlocked.
//
// Classification is by event TYPE, per the spec's normative list:
//   - Attributed: `tx.created`, `tx.updated`, `tx.deleted`, the enveloped
//     `*.created` events (`account.created`, `category.created`, `tag.created`),
//     and (since #388) the PascalCase config/taxonomy stream
//     (`*Created/*Updated/*Archived/*Unarchived/*Deleted` for
//     Account/Category/Subcategory/Tag). These carry a real actor/device →
//     render it.
//   - Flat: `tx.note.*`, `tx.split[.removed]`, `movement.imported`,
//     `import.mapping.updated`. They record *what* + *when* but not *who* →
//     actor/device `unknown` with reason `flat`.
//   - Pre-coverage: an attributed-type event whose actor/device is absent or a
//     known placeholder → `unknown (pre-coverage)`. Never back-filled. Config
//     events written before #388 fall here (the type is attribution-capable but
//     those specific events predate the actor fields).
//
// Pure + deterministic: no I/O, no clock, no master key. Unit-tested directly.

import type { DomainEvent } from '../events/schemas.js';
import type {
  ChangeHistoryActor,
  ChangeHistoryDetail,
  ChangeHistoryDevice,
  ChangeHistoryRow,
} from '../../shared/ipc-contracts/audit.js';

/**
 * Event types whose envelope carries a genuine actor/device (spec §3.4). Note
 * `tx.deleted` is flat-shaped on the wire but DOES carry actor fields and is
 * attributed; the enveloped `*.created` events are attributed.
 */
const ATTRIBUTED_TYPES: ReadonlySet<string> = new Set([
  'tx.created',
  'tx.updated',
  'tx.deleted',
  'account.created',
  'category.created',
  'tag.created',
]);

/**
 * #388 — PascalCase config/taxonomy events (WI-15-lite + WI-21 stream). These
 * are attribution-CAPABLE: events written after #388 carry optional
 * `actorUserId` / `actorDeviceId` and are rendered with the real actor/device,
 * while legacy events written before #388 lack those fields and are rendered
 * `unknown (pre-coverage)` — never `flat` — so old rows read honestly rather
 * than implying the actor data is permanently absent for this event class.
 */
const CONFIG_ATTRIBUTED_TYPES: ReadonlySet<string> = new Set([
  'AccountCreated',
  'AccountUpdated',
  'AccountArchived',
  'AccountUnarchived',
  'AccountDeleted',
  'CategoryCreated',
  'CategoryUpdated',
  'CategoryArchived',
  'CategoryUnarchived',
  'CategoryDeleted',
  'SubcategoryCreated',
  'SubcategoryUpdated',
  'SubcategoryArchived',
  'SubcategoryUnarchived',
  'SubcategoryDeleted',
  'TagCreated',
  'TagUpdated',
  'TagArchived',
  'TagUnarchived',
  'TagDeleted',
]);

/** True when the event TYPE is capable of carrying an actor/device. */
function isAttributedType(type: string): boolean {
  return ATTRIBUTED_TYPES.has(type) || CONFIG_ATTRIBUTED_TYPES.has(type);
}

/**
 * Placeholder actor id written before a real profile exists (see bootstrap's
 * `actorUserId: profile?.userId ?? 'PROFILE_PENDING...'`). Treated as
 * pre-coverage so the viewer never presents a placeholder as a real actor.
 */
const PLACEHOLDER_ACTOR_PREFIX = 'PROFILE_PENDING';

interface AnyEvent {
  readonly type: string;
  readonly id?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
  readonly editedAt?: unknown;
  readonly deletedAt?: unknown;
  readonly archivedAt?: unknown;
  readonly unarchivedAt?: unknown;
  readonly removedAt?: unknown;
  readonly actorUserId?: unknown;
  readonly actorDeviceId?: unknown;
  readonly accountId?: unknown;
  readonly payload?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** The instant a change occurred — each event shape names its timestamp differently. */
function extractOccurredAt(e: AnyEvent): string | null {
  return (
    str(e.createdAt) ??
    str(e.updatedAt) ??
    str(e.editedAt) ??
    str(e.deletedAt) ??
    str(e.archivedAt) ??
    str(e.unarchivedAt) ??
    str(e.removedAt) ??
    null
  );
}

/** Best-effort account context id, when the event carries one. */
function extractAccountId(e: AnyEvent): string | null {
  // Enveloped tx events carry the account inside the payload.
  const payload = e.payload;
  if (payload !== null && typeof payload === 'object') {
    const fromPayload = str((payload as { accountId?: unknown }).accountId);
    if (fromPayload !== null) return fromPayload;
    // The enveloped account-creation event keys the new account on `payload.id`.
    if (e.type === 'account.created') {
      const fromPayloadId = str((payload as { id?: unknown }).id);
      if (fromPayloadId !== null) return fromPayloadId;
    }
  }
  // Flat config / import events carry a top-level `accountId`.
  const top = str(e.accountId);
  if (top !== null) return top;
  // The flat account-creation event keys the new account on its own `id`.
  if (e.type === 'AccountCreated') return str(e.id);
  return null;
}

function deriveActor(e: AnyEvent): ChangeHistoryActor {
  if (!isAttributedType(e.type)) {
    return { kind: 'unknown', reason: 'flat' };
  }
  const userId = str(e.actorUserId);
  if (userId === null || userId.startsWith(PLACEHOLDER_ACTOR_PREFIX)) {
    return { kind: 'unknown', reason: 'pre-coverage' };
  }
  return { kind: 'known', userId };
}

function deriveDevice(e: AnyEvent): ChangeHistoryDevice {
  if (!isAttributedType(e.type)) {
    return { kind: 'unknown' };
  }
  const deviceId = str(e.actorDeviceId);
  if (deviceId === null) {
    return { kind: 'unknown' };
  }
  return { kind: 'known', deviceId };
}

/**
 * Enveloped/flat config & taxonomy CRUD events (`account.created` plus the #388
 * PascalCase stream). These get a richer LABEL only (OQ15) — no transaction
 * snapshot, no diff.
 */
const CONFIG_CREATED_TYPES: ReadonlySet<string> = new Set([
  'account.created',
  'category.created',
  'tag.created',
]);

function isConfigType(type: string): boolean {
  return CONFIG_CREATED_TYPES.has(type) || CONFIG_ATTRIBUTED_TYPES.has(type);
}

/** Map an event TYPE to its detail discriminator (SPEC-028 FR18/FR21, OQ15). */
function summaryKindFor(type: string): ChangeHistoryDetail['summaryKind'] {
  if (type === 'tx.created') return 'tx.created';
  if (type === 'tx.updated') return 'tx.updated';
  if (type === 'tx.deleted') return 'tx.deleted';
  if (isConfigType(type)) return 'config';
  return 'flat';
}

function asTxType(v: unknown): 'income' | 'expense' | null {
  return v === 'income' || v === 'expense' ? v : null;
}

function asStatus(v: unknown): 'pending' | 'approved' | null {
  return v === 'pending' || v === 'approved' ? v : null;
}

/**
 * SPEC-028 FR23 — the bulk-action correlation ULID, carried in the `tx.updated`
 * payload (emitted one-per-transaction by the bulk commands). Benign to surface
 * (a ULID, not PII). `null` for single updates and non-tx events.
 */
function extractCorrelationId(e: AnyEvent): string | null {
  const payload = e.payload;
  if (payload !== null && typeof payload === 'object') {
    return str((payload as { correlationId?: unknown }).correlationId);
  }
  return null;
}

/**
 * SPEC-028 FR19 — extract Tier-1 transaction detail PURELY from the event
 * snapshot, resolving category/subcategory/tag labels via the injected
 * read-model resolvers (resolution stays in main). Returns `null` when the
 * payload lacks the required snapshot fields so the row degrades to a bare
 * action label rather than fabricating detail (FR24).
 */
function extractTxDetail(
  payload: Record<string, unknown>,
  summaryKind: 'tx.created' | 'tx.updated',
  deps: ChangeHistoryProjectionDeps,
): ChangeHistoryDetail | null {
  const amount = payload.amount;
  const txType = asTxType(payload.type);
  const status = asStatus(payload.status);
  if (typeof amount !== 'number' || txType === null || status === null) return null;

  const categoryId = str(payload.categoryId);
  const subcategoryId = str(payload.subcategoryId);
  const tagIds = Array.isArray(payload.tagIds)
    ? payload.tagIds.filter((t): t is string => typeof t === 'string' && t.length > 0)
    : [];

  return {
    summaryKind,
    amount,
    currency: 'EUR',
    txType,
    description: typeof payload.description === 'string' ? payload.description : '',
    categoryId,
    categoryLabel:
      categoryId !== null && deps.categoryLabelById ? deps.categoryLabelById(categoryId) : null,
    subcategoryId,
    subcategoryLabel:
      subcategoryId !== null && deps.subcategoryLabelById
        ? deps.subcategoryLabelById(subcategoryId)
        : null,
    tagIds,
    tagLabels: tagIds.map((id) => deps.tagLabelById?.(id) ?? id),
    status,
    reference: str(payload.reference),
  };
}

/** Build the Tier-1 detail object for a row, or `undefined` when none applies. */
function deriveDetail(
  e: AnyEvent,
  deps: ChangeHistoryProjectionDeps,
): ChangeHistoryDetail | undefined {
  const summaryKind = summaryKindFor(e.type);
  if (summaryKind === 'tx.created' || summaryKind === 'tx.updated') {
    const payload =
      e.payload !== null && typeof e.payload === 'object'
        ? (e.payload as Record<string, unknown>)
        : null;
    return payload ? (extractTxDetail(payload, summaryKind, deps) ?? undefined) : undefined;
  }
  // `tx.deleted` (no snapshot), `config`, and `flat` → label-only detail.
  return { summaryKind };
}

export interface ChangeHistoryFilter {
  /** Inclusive lower bound on the date portion of `occurredAt` (`YYYY-MM-DD`). */
  readonly dateFrom?: string;
  /** Inclusive upper bound on the date portion of `occurredAt` (`YYYY-MM-DD`). */
  readonly dateTo?: string;
  readonly accountIds?: readonly string[];
  /** Match only events attributed to one of these devices (excludes `unknown`). */
  readonly deviceIds?: readonly string[];
}

export interface ChangeHistoryProjectionDeps {
  /** Resolve an account ULID to its display label (from the read model). */
  readonly accountLabelById?: (accountId: string) => string | null;
  /** Resolve a category ULID to its display label (FR19; main-only). */
  readonly categoryLabelById?: (categoryId: string) => string | null;
  /** Resolve a subcategory ULID to its display label (FR19; main-only). */
  readonly subcategoryLabelById?: (subcategoryId: string) => string | null;
  /** Resolve a tag ULID to its display label (FR19; main-only). */
  readonly tagLabelById?: (tagId: string) => string | null;
}

export interface ChangeHistoryProjectionResult {
  readonly rows: readonly ChangeHistoryRow[];
  /** Count of projectable rows BEFORE applying `filter` (for "N of M"). */
  readonly totalCount: number;
}

/**
 * Project every domain event into a change-history row, then apply the filter.
 * Rows are returned newest-first (descending `occurredAt`, ties broken by
 * `eventId` descending for stable ordering). Events without a usable timestamp
 * are dropped (they cannot be placed on the timeline) rather than guessed.
 */
export function projectChangeHistory(
  events: readonly DomainEvent[],
  filter: ChangeHistoryFilter = {},
  deps: ChangeHistoryProjectionDeps = {},
): ChangeHistoryProjectionResult {
  const all: ChangeHistoryRow[] = [];
  // Parallel to `all` — the bulk-action correlation id per row (FR23). Kept off
  // the view-model; used only to compute group keys/sizes over the full set.
  const correlationIds: (string | null)[] = [];

  for (const raw of events) {
    const e = raw as unknown as AnyEvent;
    const occurredAt = extractOccurredAt(e);
    const eventId = str(e.id);
    if (occurredAt === null || eventId === null) continue;

    const accountId = extractAccountId(e);
    const accountLabel =
      accountId !== null && deps.accountLabelById ? deps.accountLabelById(accountId) : null;
    const detail = deriveDetail(e, deps);

    all.push({
      lane: 'history',
      eventId,
      occurredAt,
      action: e.type,
      actor: deriveActor(e),
      device: deriveDevice(e),
      accountId,
      accountLabel,
      groupId: null,
      groupSize: null,
      ...(detail !== undefined ? { detail } : {}),
    });
    correlationIds.push(extractCorrelationId(e));
  }

  const totalCount = all.length;

  // FR23 — count bulk-group members over the FULL set BEFORE display filtering,
  // so the "M of N" header never miscounts when a filter hides some members. A
  // correlationId with a single member renders as a normal row (no group chrome).
  const groupCounts = new Map<string, number>();
  for (const cid of correlationIds) {
    if (cid !== null) groupCounts.set(cid, (groupCounts.get(cid) ?? 0) + 1);
  }
  for (let i = 0; i < all.length; i += 1) {
    const cid = correlationIds[i]!;
    const size = cid !== null ? (groupCounts.get(cid) ?? 0) : 0;
    if (cid !== null && size > 1) {
      all[i] = { ...all[i]!, groupId: cid, groupSize: size };
    }
  }

  const accountSet =
    filter.accountIds && filter.accountIds.length > 0 ? new Set(filter.accountIds) : null;
  const deviceSet =
    filter.deviceIds && filter.deviceIds.length > 0 ? new Set(filter.deviceIds) : null;

  const filtered = all.filter((row) => {
    // Compare on the date portion only so an inclusive `YYYY-MM-DD` upper bound
    // matches every instant of that day.
    const day = row.occurredAt.slice(0, 10);
    if (filter.dateFrom !== undefined && day < filter.dateFrom) return false;
    if (filter.dateTo !== undefined && day > filter.dateTo) return false;
    if (accountSet !== null && (row.accountId === null || !accountSet.has(row.accountId))) {
      return false;
    }
    if (deviceSet !== null) {
      if (row.device.kind !== 'known' || !deviceSet.has(row.device.deviceId)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
    return a.eventId < b.eventId ? 1 : a.eventId > b.eventId ? -1 : 0;
  });

  return { rows: filtered, totalCount };
}
