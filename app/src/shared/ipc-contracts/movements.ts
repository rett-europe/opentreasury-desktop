// Movements IPC contract — WI-12.
// Channel + Zod schemas for `movements:list`. Response shape matches the
// renderer's `types/movementsFilter.ts` `MovementRecord` (wire level,
// ID-based). The display-layer mapping to `types/movement.ts` (labels,
// localised status) is the renderer's responsibility (WI-14).

import { z } from 'zod';

// IPC channel name constant
export const IPC_MOVEMENTS_LIST = 'movements:list';

// ============================================================================
// Request — optional filters (all no-op in v1; wired here so Trinity can
// evolve filter UX without a contract break)
// ============================================================================

export const movementsListRequestSchema = z.object({
  accountId: z.string().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().positive().max(5000).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export type MovementsListRequest = z.infer<typeof movementsListRequestSchema>;

// ============================================================================
// Response — MovementRecord[] matching renderer/types/movementsFilter.ts
// (ID-based wire shape; same columns as recentTransactionSchema in panel.ts).
// ============================================================================

export const movementTypeSchema = z.enum(['income', 'expense']);
export const movementStatusSchema = z.enum(['pending', 'approved']);

export const movementRecordSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: movementTypeSchema,
  amount: z.number().nonnegative(),
  currency: z.literal('EUR'),
  description: z.string(),
  accountId: z.string(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
  tagIds: z.array(z.string()),
  status: movementStatusSchema,
  createdAt: z.string(),
  // WI-19 — optional transaction extras (read-only in this WI). Shown in the
  // detail modal; not rendered in the Movements table.
  reference: z.string().max(120).nullable().optional(),
  details: z.string().max(1000).nullable().optional(),
});

export type MovementRecord = z.infer<typeof movementRecordSchema>;

// Alias — Trinity's renderer code uses `Movement` in some call sites; both
// names refer to the same wire shape. Keep until the renderer unifies on one.
export type Movement = MovementRecord;

export const movementsListResponseSchema = z.array(movementRecordSchema);

export type MovementsListResponse = z.infer<typeof movementsListResponseSchema>;
