// Movements IPC contract — WI-12.
// Channel + Zod schemas for `movements:list`. Response shape matches the
// renderer's `types/movement.ts` so the existing MovementsScreen consumes
// main-side projections without a second mapping layer.

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
// Response — Movement[] matching renderer/types/movement.ts
// ============================================================================

export const movementTypeSchema = z.enum(['income', 'expense']);
export const movementStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const movementSchema = z.object({
  id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: movementTypeSchema,
  amount: z.number().positive(),
  currency: z.literal('EUR'),
  description: z.string(),
  account: z.string(),
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
  tags: z.array(z.string()),
  status: movementStatusSchema,
});

export type Movement = z.infer<typeof movementSchema>;

export const movementsListResponseSchema = z.array(movementSchema);

export type MovementsListResponse = z.infer<typeof movementsListResponseSchema>;
