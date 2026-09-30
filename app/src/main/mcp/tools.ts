import { z } from 'zod';
import type { ReadModel, Transaction } from '../../core/query/types.js';
import {
  bulkUpdateTransactions,
  deleteTransaction,
  updateTransaction,
  type UpdateTransactionInput,
} from '../../core/commands/index.js';
import type { EventLog, DomainEvent } from '../../core/eventLog/index.js';
import { applyEvent } from '../../core/query/reducers.js';

export const listTransactionsInputSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(['pending', 'approved']).optional(),
  uncategorized: z.boolean().optional(),
  accountId: z.string().optional(),
  text: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});
export const getTransactionInputSchema = z.object({ id: z.string().min(1) });
export type ListTransactionsInput = z.input<typeof listTransactionsInputSchema>;
export interface McpToolResult {
  content: readonly [{ type: 'text'; text: string }];
  isError?: boolean;
}
const nullableId = z.string().min(1).nullable();
const patchBaseSchema = z.object({
  id: z.string().min(1),
  categoryId: nullableId.optional(),
  subcategoryId: nullableId.optional(),
  tagIds: z.array(z.string().min(1)).optional(),
});
export const classifyTransactionsInputSchema = z.object({
  items: z.array(patchBaseSchema).min(1).max(500),
});
export const setTransactionTypeInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
  type: z.enum(['income', 'expense']),
});
export const updateTransactionsInputSchema = z.object({
  items: z
    .array(
      patchBaseSchema.extend({
        amount: z.number().positive().optional(),
        type: z.enum(['income', 'expense']).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
        description: z.string().min(1).max(500).optional(),
        details: z.string().max(1000).nullable().optional(),
        reference: z.string().max(120).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});
export const deleteTransactionsInputSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});
export interface McpWriteDeps {
  readonly eventLog: EventLog;
  readonly readModel: ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly datasetId: string;
  readonly actorDeviceId: string;
  readonly actorUserId: string;
  readonly dekVersion?: number;
}
type Failure = { id: string; code: string; message: string };
function validateRefs(
  model: ReadModel,
  item: {
    id: string;
    categoryId?: string | null | undefined;
    subcategoryId?: string | null | undefined;
    tagIds?: readonly string[] | undefined;
  },
): Failure[] {
  const failures: Failure[] = [];
  const cat = item.categoryId ? model.configCategories.find((c) => c.id === item.categoryId) : null;
  if (item.categoryId && !cat)
    failures.push({ id: item.id, code: 'NOT_FOUND', message: 'categoryId not found' });
  if (item.subcategoryId) {
    if (!cat)
      failures.push({
        id: item.id,
        code: 'INVALID_REFERENCE',
        message: 'subcategory requires categoryId',
      });
    else if (!cat.subcategories.some((s) => s.id === item.subcategoryId))
      failures.push({
        id: item.id,
        code: 'INVALID_REFERENCE',
        message: 'subcategoryId does not belong to categoryId',
      });
  }
  for (const tagId of item.tagIds ?? []) {
    if (!model.configTags.some((t) => t.id === tagId))
      failures.push({ id: item.id, code: 'NOT_FOUND', message: `tagId not found: ${tagId}` });
  }
  return failures;
}
function lockedAndRefFailures(
  model: ReadModel,
  items: readonly {
    id: string;
    categoryId?: string | null | undefined;
    subcategoryId?: string | null | undefined;
    tagIds?: readonly string[] | undefined;
  }[],
): Failure[] {
  const failures: Failure[] = [];
  for (const item of items) {
    const tx = model.transactions.find((t) => t.id === item.id);
    if (!tx) failures.push({ id: item.id, code: 'TX_NOT_FOUND', message: 'transaction not found' });
    else if (tx.status === 'approved')
      failures.push({
        id: item.id,
        code: 'TX_LOCKED',
        message: 'approved transactions cannot be modified by MCP',
      });
    if (tx) {
      const categoryId = item.categoryId !== undefined ? item.categoryId : tx.categoryId;
      const subcategoryId =
        item.subcategoryId !== undefined
          ? item.subcategoryId
          : item.categoryId !== undefined
            ? null
            : tx.subcategoryId;
      failures.push(...validateRefs(model, { ...item, categoryId, subcategoryId }));
    } else {
      failures.push(...validateRefs(model, item));
    }
  }
  return failures;
}
async function appendAll(deps: McpWriteDeps, events: readonly DomainEvent[]): Promise<void> {
  if (events.length === 0) return;
  const before = (await deps.eventLog.load()).length;
  await deps.eventLog.appendBatch(events);
  const after = (await deps.eventLog.load()).length;
  if (after > before) for (const event of events) applyEvent(event);
}
function skippedSplitParents(model: ReadModel, ids: readonly string[]) {
  return ids
    .filter((id) => model.splitParentIds.has(id))
    .map((id) => ({ id, code: 'TX_HAS_ACTIVE_SPLITS', message: 'split parent skipped' }));
}
export async function classifyTransactions(
  deps: McpWriteDeps,
  raw: unknown,
): Promise<McpToolResult> {
  const input = classifyTransactionsInputSchema.parse(raw);
  const correlationId = deps.newId();
  const skipped = skippedSplitParents(
    deps.readModel,
    input.items.map((i) => i.id),
  );
  const items = input.items.filter((i) => !deps.readModel.splitParentIds.has(i.id));
  const failures = lockedAndRefFailures(deps.readModel, items);
  if (failures.length) return text({ updatedCount: 0, correlationId, failures, skipped }, true);
  const events: DomainEvent[] = [];
  for (const item of items) {
    const r = bulkUpdateTransactions(
      {
        ids: [item.id],
        categoryId: item.categoryId,
        subcategoryId:
          item.subcategoryId !== undefined
            ? item.subcategoryId
            : item.categoryId !== undefined
              ? null
              : undefined,
        tagIds: item.tagIds,
        status: 'pending',
        correlationId,
      },
      { ...deps, actorIdentitySource: 'mcp' },
    );
    if (!r.ok) return text({ updatedCount: 0, correlationId, failures: r.failures, skipped }, true);
    events.push(...r.events);
  }
  await appendAll(deps, events);
  return text({ updatedCount: events.length, correlationId, failures: [], skipped });
}
export async function setTransactionType(deps: McpWriteDeps, raw: unknown): Promise<McpToolResult> {
  const input = setTransactionTypeInputSchema.parse(raw);
  const correlationId = deps.newId();
  const skipped = skippedSplitParents(deps.readModel, input.ids);
  const ids = input.ids.filter((id) => !deps.readModel.splitParentIds.has(id));
  const failures = lockedAndRefFailures(
    deps.readModel,
    ids.map((id) => ({ id })),
  );
  if (failures.length) return text({ updatedCount: 0, correlationId, failures, skipped }, true);
  const result = bulkUpdateTransactions(
    { ids, type: input.type, status: 'pending', correlationId },
    { ...deps, actorIdentitySource: 'mcp' },
  );
  if (!result.ok)
    return text({ updatedCount: 0, correlationId, failures: result.failures, skipped }, true);
  await appendAll(deps, result.events);
  return text({ updatedCount: result.events.length, correlationId, failures: [], skipped });
}
export async function updateTransactions(deps: McpWriteDeps, raw: unknown): Promise<McpToolResult> {
  const input = updateTransactionsInputSchema.parse(raw);
  const correlationId = deps.newId();
  const skipped = skippedSplitParents(
    deps.readModel,
    input.items.map((i) => i.id),
  );
  const items = input.items.filter((i) => !deps.readModel.splitParentIds.has(i.id));
  const failures = lockedAndRefFailures(deps.readModel, items);
  if (failures.length) return text({ updatedCount: 0, correlationId, failures, skipped }, true);
  const events: DomainEvent[] = [];
  for (const item of items) {
    const tx = deps.readModel.transactions.find((t) => t.id === item.id)!;
    const update: UpdateTransactionInput = {
      id: item.id,
      date: item.date ?? tx.date,
      type: item.type ?? tx.type,
      amount: item.amount ?? tx.amount,
      description: item.description ?? tx.description,
      categoryId: item.categoryId === undefined ? tx.categoryId : item.categoryId,
      subcategoryId:
        item.subcategoryId !== undefined
          ? item.subcategoryId
          : item.categoryId !== undefined
            ? null
            : tx.subcategoryId,
      tagIds: item.tagIds ?? tx.tagIds,
      status: 'pending',
      reference: item.reference !== undefined ? item.reference : tx.reference,
      details: item.details !== undefined ? item.details : tx.details,
    };
    const r = updateTransaction(update, { ...deps, actorIdentitySource: 'mcp' });
    if (!r.ok)
      return text(
        {
          updatedCount: 0,
          correlationId,
          failures: [{ id: item.id, code: r.error.code, message: r.error.message }],
          skipped,
        },
        true,
      );
    events.push({ ...r.value, payload: { ...r.value.payload, correlationId } });
  }
  await appendAll(deps, events);
  return text({ updatedCount: events.length, correlationId, failures: [], skipped });
}
export async function deleteTransactions(deps: McpWriteDeps, raw: unknown): Promise<McpToolResult> {
  const input = deleteTransactionsInputSchema.parse(raw);
  const correlationId = deps.newId();
  const skipped = skippedSplitParents(deps.readModel, input.ids);
  const ids = input.ids.filter((id) => !deps.readModel.splitParentIds.has(id));
  const failures: Failure[] = [];
  for (const id of ids) {
    const tx = deps.readModel.transactions.find((t) => t.id === id);
    if (!tx) failures.push({ id, code: 'TX_NOT_FOUND', message: 'transaction not found' });
    else if (tx.status !== 'pending')
      failures.push({
        id,
        code: 'TX_LOCKED',
        message: 'only pending transactions can be deleted by MCP',
      });
  }
  if (failures.length) return text({ updatedCount: 0, correlationId, failures, skipped }, true);
  const events: DomainEvent[] = [];
  for (const id of ids) {
    const r = deleteTransaction({ id }, { ...deps, actorIdentitySource: 'mcp' });
    if (!r.ok)
      return text(
        {
          updatedCount: 0,
          correlationId,
          failures: [{ id, code: r.error.code, message: r.error.message }],
          skipped,
        },
        true,
      );
    events.push(r.value);
  }
  await appendAll(deps, events);
  return text({ updatedCount: events.length, correlationId, failures: [], skipped });
}
function text(data: unknown, isError = false): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data) }],
    ...(isError ? { isError } : {}),
  };
}
export function appLockedError(): McpToolResult {
  return text({ code: 'APP_LOCKED', message: 'Workspace is locked or not loaded.' }, true);
}
function publicTx(t: Transaction) {
  const {
    id,
    date,
    type,
    amount,
    description,
    accountId,
    categoryId,
    subcategoryId,
    tagIds,
    status,
  } = t;
  return {
    id,
    date,
    type,
    amount,
    description,
    accountId,
    categoryId,
    subcategoryId,
    tagIds,
    status,
  };
}
export function listTransactions(model: ReadModel, raw: unknown): McpToolResult {
  const input = listTransactionsInputSchema.parse(raw ?? {});
  const q = input.text?.toLowerCase();
  const rows = model.transactions
    .filter(
      (t) =>
        (!input.from || t.date >= input.from) &&
        (!input.to || t.date <= input.to) &&
        (!input.status || t.status === input.status) &&
        (!input.accountId || t.accountId === input.accountId) &&
        (input.uncategorized === undefined ||
          (input.uncategorized ? t.categoryId === null : t.categoryId !== null)) &&
        (!q || t.description.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const offset = input.cursor
    ? Number.parseInt(Buffer.from(input.cursor, 'base64url').toString('utf8'), 10)
    : 0;
  const safeOffset = Number.isFinite(offset) && offset > 0 ? offset : 0;
  const page = rows.slice(safeOffset, safeOffset + input.limit).map(publicTx);
  const next =
    safeOffset + input.limit < rows.length
      ? Buffer.from(String(safeOffset + input.limit)).toString('base64url')
      : null;
  return text({ transactions: page, nextCursor: next });
}
export function getTransaction(model: ReadModel, raw: unknown): McpToolResult {
  const input = getTransactionInputSchema.parse(raw);
  const tx = model.transactions.find((t) => t.id === input.id);
  return tx
    ? text({ transaction: publicTx(tx) })
    : text({ code: 'NOT_FOUND', message: 'Transaction not found.' }, true);
}
export function listCategories(model: ReadModel): McpToolResult {
  return text({
    categories: model.configCategories.map(
      ({ id, name, color, kind, isInternalTransfer, subcategories }) => ({
        id,
        name,
        color,
        kind,
        isInternalTransfer,
        subcategories: subcategories.map(({ id, parentCategoryId, name, color }) => ({
          id,
          parentCategoryId,
          name,
          color,
        })),
      }),
    ),
  });
}
export function listTags(model: ReadModel): McpToolResult {
  return text({ tags: model.configTags.map(({ id, name, color }) => ({ id, name, color })) });
}
export function listAccounts(model: ReadModel): McpToolResult {
  return text({
    accounts: model.configAccounts.map(({ id, name, bankName, label, iban, color, currency }) => ({
      id,
      name,
      bankName,
      label,
      iban,
      color,
      currency,
    })),
  });
}
