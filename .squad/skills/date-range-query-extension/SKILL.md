---
name: "date-range-query-extension"
description: "Add a new date-range query variant to the IPC contract when month-anchored queries don't fit the use case (e.g., rolling windows)."
domain: "ipc-contracts"
confidence: "high"
source: "earned"
---

## Context

Use this pattern when you need to extend the Panel (or similar) IPC surface with a **date-range query** (from/to inclusive) alongside existing **month-anchored queries** (yearMonth prefix match).

Signals you want this pattern:
- Existing query filters by `tx.date.startsWith(yearMonth)` — a calendar month.
- You need a **rolling window** (last N days) or arbitrary range that doesn't align with calendar months.
- Multiple screens may depend on the month-anchored query, so you don't want to modify it.

Example: Dashboard needed a rolling 30-day window to avoid the calendar-cliff bug (empty on the 1st of every month), but Movements screen still uses month-anchored filtering.

## Patterns

1. **Add a parallel query, don't modify the existing one.** Keep `getMonthKPIs(yearMonth)` unchanged for backward compatibility. Add `getRangeKPIs(from, to)` as a sibling query with the same aggregation logic but inclusive date boundaries.

2. **Core query location:** `app/src/core/query/queries.ts`
   - Copy the existing query function (e.g., `getMonthKPIs`)
   - Change the filter: `tx.date.startsWith(yearMonth)` → `tx.date >= from && tx.date <= to`
   - Update the return type interface to reflect `{ from, to, ... }` instead of `{ yearMonth, ... }`
   - Example:
     ```ts
     export interface RangeKPIs {
       readonly from: string; // YYYY-MM-DD
       readonly to: string; // YYYY-MM-DD
       readonly income: number;
       readonly expense: number;
       readonly net: number;
       readonly transactionCount: number;
     }

     export function getRangeKPIs(from: string, to: string): RangeKPIs {
       const model = getReadModel();
       let income = 0, expense = 0, count = 0;
       for (const tx of model.transactions) {
         if (tx.date >= from && tx.date <= to) {
           // ... aggregation logic
         }
       }
       return { from, to, income, expense, net, transactionCount: count };
     }
     ```

3. **IPC contract extension:** `app/src/shared/ipc-contracts/panel.ts`
   - Add a new channel constant: `export const IPC_PANEL_GET_RANGE_KPIS = 'panel:get-range-kpis';`
   - Define Zod request/response schemas:
     ```ts
     export const getRangeKPIsRequestSchema = z.object({
       from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
       to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
     });
     export type GetRangeKPIsRequest = z.infer<typeof getRangeKPIsRequestSchema>;

     export const rangeKPIsSchema = z.object({
       from: z.string(),
       to: z.string(),
       income: z.number().nonnegative(),
       expense: z.number().nonnegative(),
       net: z.number(),
       transactionCount: z.number().int().nonnegative(),
     });
     export const getRangeKPIsResponseSchema = z.object({
       kpis: rangeKPIsSchema,
     });
     export type GetRangeKPIsResponse = z.infer<typeof getRangeKPIsResponseSchema>;
     ```

4. **IPC handler:** `app/src/main/ipc/handlers/panel.ts`
   - Import the new core query and types:
     ```ts
     import { getRangeKPIs as coreGetRangeKPIs } from '../../../core/query/index.js';
     ```
   - Add handler function:
     ```ts
     export async function handleGetRangeKPIs(
       request: GetRangeKPIsRequest,
     ): Promise<GetRangeKPIsResponse> {
       return { kpis: coreGetRangeKPIs(request.from, request.to) };
     }
     ```

5. **IPC registration:** `app/src/main/ipc/handlers.ts`
   - Import the channel constant, schemas, and handler
   - Register with `ipcMain.handle(IPC_PANEL_GET_RANGE_KPIS, async (_event, raw: unknown) => { ... })`
   - Parse request, call handler, parse response (standard pattern)

6. **Preload bridge:** `app/src/preload/index.ts`
   - Import types and channel constant
   - Add method to the `panel` namespace:
     ```ts
     getRangeKPIs: (req: GetRangeKPIsRequest): Promise<GetRangeKPIsResponse> => {
       return ipcRenderer.invoke(IPC_PANEL_GET_RANGE_KPIS, req);
     },
     ```

7. **Renderer API:** `app/src/renderer/services/panelApi.ts`
   - Export a wrapper function:
     ```ts
     export async function getRangeKPIs(from: string, to: string): Promise<GetRangeKPIsResponse> {
       const raw = await window.opentreasury.panel.getRangeKPIs({ from, to });
       return getRangeKPIsResponseSchema.parse(raw);
     }
     ```

8. **Date preset (if adding a rolling window):** `app/src/renderer/utils/datePresets.ts`
   - Add the preset ID to `DATE_PRESET_IDS` array
   - Write a factory function:
     ```ts
     export function last30Days(today: Date): IsoDateRange {
       const t = utcToday(today);
       const start = new Date(t.getTime());
       start.setUTCDate(start.getUTCDate() - 29); // 30 days inclusive
       return { from: toIsoDate(start), to: toIsoDate(t) };
     }
     ```
   - Register in `FACTORIES` map
   - Add test cases covering edge boundaries (month/year rollover)

9. **Screen usage:** Call the new API with a rolling window:
   ```ts
   const range = last30Days(new Date());
   const kpisResp = await panelApi.getRangeKPIs(range.from, range.to);
   ```

10. **Test coverage:**
    - Add unit test for the core query (`core/query/queries.test.ts`) covering inclusive boundaries + empty range
    - Add tests for the new preset (`renderer/utils/datePresets.test.ts`)
    - Update existing preset ID list assertions to include the new preset

## Examples

- **PR #221:** Added `getRangeKPIs` for rolling 30-day dashboard window
  - Core query: `app/src/core/query/queries.ts` lines 133-169
  - IPC contract: `app/src/shared/ipc-contracts/panel.ts` lines 105-133
  - Handler: `app/src/main/ipc/handlers/panel.ts` lines 61-65
  - Preload: `app/src/preload/index.ts` lines 215-217
  - Renderer API: `app/src/renderer/services/panelApi.ts` lines 48-56
  - Preset: `app/src/renderer/utils/datePresets.ts` lines 89-95
  - Usage: `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` lines 68-79

## Anti-Patterns

- ❌ **Modifying the existing month-anchored query** — breaks screens that rely on calendar-month semantics (e.g., reconciliation workflows).
- ❌ **Using `new Date()` directly in the screen component** — makes tests non-deterministic. Always wrap in a preset factory that accepts `today: Date`.
- ❌ **Forgetting to update `DATE_PRESET_IDS` assertion in tests** — causes test failures when a new preset is added but the list isn't updated.
- ❌ **Parsing date strings with `Date` objects for comparison** — use lexicographic comparison (`tx.date >= from && tx.date <= to`) for YYYY-MM-DD strings. It's safe, fast, and avoids timezone pitfalls.


## Additional Examples

- **PR #224:** Added `getAccountBalancesInRange(from, to)` for dashboard account cards
  - Core query: `app/src/core/query/queries.ts` lines 93-128
  - IPC contract: `app/src/shared/ipc-contracts/panel.ts` lines 71-93
  - Handler: `app/src/main/ipc/handlers/panel.ts` lines 63-66
  - Preload: `app/src/preload/index.ts` lines 212-217
  - Renderer API: `app/src/renderer/services/panelApi.ts` lines 37-49
  - Usage: `app/src/renderer/screens/PanelScreen/PanelScreen.tsx` line 69
  - Pattern: Mirrored `getAccountBalances()` but filtered by date range; preserved all-time query for other callers
