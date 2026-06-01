// SPEC-027 §14 — 100k-row XLSX streaming memory/time test (AC25 / NFR6 / NFR4).
//
// Exports the FR9 cap (100 000 rows) through the styled (`useStyles: true`)
// streaming writer and asserts (a) the heap retained WHILE THE WRITER IS ALIVE
// stays within the NFR4 budget (≤ +150 MB over baseline) and (b) the run stays
// within the NFR1 time budget. NFR6 mandates column-level/shared styling; this
// gate enforces the NFR4 memory CEILING that follows from it.
//
// What this catches (empirically measured at 100k rows, --expose-gc):
//   * column-level/shared styling (the correct NFR6 implementation): ~1.7 MB
//     retained — far under budget.
//   * per-cell styling in the row loop with VALUE-IDENTICAL styles: ~1.6 MB —
//     exceljs dedupes identical style objects, so this is harmless to NFR4 (it
//     is a code-style/NFR6 concern caught by review + the golden test, not a
//     memory regression).
//   * per-cell styling with HIGH-CARDINALITY (effectively unique) styles, which
//     defeats dedup and is the real NFR4 hazard: ~480 MB retained — trips this
//     gate decisively.
//
// Why we sample DURING the write (and why the old test flaked):
//   * The shared-style table is only reachable while the WorkbookWriter is alive
//     (a local in writeXlsx). A snapshot taken AFTER writeExport returns would
//     measure a heap from which the writer — and any style-table bloat — has
//     already been collected: the ~480 MB unique-style case collapses back to
//     ~0, so a post-completion check could not catch it. We therefore sample
//     through the existing `onProgress` hook while the writer is still live.
//   * Each sample forces a GC first. The forced GC drops transient zip/
//     serialisation spikes (the timing-dependent noise that made the previous
//     interval-sampled `peak` fail at ~190 MB on CI) while the genuinely-retained
//     working set — crucially the style table — survives and is measured. The
//     result is deterministic on a constrained runner yet still reflects real
//     retained growth at scale.
//   * `--expose-gc` is guaranteed by the integration lane
//     (vitest.integration.config.ts → poolOptions.*.execArgv); `forceGc()` throws
//     if it is ever missing rather than silently no-opping (the original bug: the
//     fast `vitest run` lane never passed the flag, so `global.gc?.()` did
//     nothing and the baseline was captured over an uncollected heap).
//   * The 100k-row input array is allocated BEFORE the baseline snapshot, so it
//     is excluded from the measured delta — NFR4 scopes the budget to the
//     writer's marginal overhead, not the caller's already-materialised rows.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeExport } from './exportService.js';
import { MAX_EXPORT_ROWS, type ExportRow } from '../../core/export/types.js';

const NFR4_HEAP_BUDGET_BYTES = 150 * 1024 * 1024;
const NFR1_TIME_BUDGET_MS = 60_000; // generous CI ceiling; NFR1's 10s bar is for 10k rows.

// Sample the live retained heap this often (rows). 25k → snapshots at 25k/50k/
// 75k/100k. Growth is monotonic in the style table, so the final snapshot (taken
// just before the worksheet/workbook commit frees the writer) bounds the peak.
const SAMPLE_EVERY_ROWS = 25_000;

/**
 * Force a deterministic mark-sweep. Fails loudly if `--expose-gc` was not passed
 * to the worker (see vitest.integration.config.ts) so the memory budget can
 * never silently degrade into a timing-dependent, uncollected-heap measurement.
 */
function forceGc(): void {
  const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
  if (typeof gc !== 'function') {
    throw new Error(
      'global.gc is unavailable — this lane must run with --expose-gc ' +
        '(configured in vitest.integration.config.ts poolOptions.*.execArgv).',
    );
  }
  // Two passes: the first may clear young-gen/finalizers, the second yields a
  // stable retained-heap reading.
  gc();
  gc();
}

function* generateRows(n: number): Generator<ExportRow> {
  for (let i = 0; i < n; i++) {
    const day = String((i % 28) + 1).padStart(2, '0');
    yield {
      date: `2025-01-${day}`,
      account: 'Cuenta corriente',
      category: 'Gastos',
      subcategory: 'Comida',
      description: `Movimiento número ${i} con una descripción razonablemente larga`,
      amount: (i % 2 === 0 ? 1 : -1) * (i + 0.5),
      currency: 'EUR',
      labels: 'etiqueta-a;etiqueta-b',
      reference: `REF-${i}`,
      comment: 'Comentario de prueba',
      id: `01HTX${String(i).padStart(21, '0')}`,
      isSplit: i % 3 === 0,
      parentId: i % 3 === 0 ? `01HPA${String(i).padStart(21, '0')}` : '',
    };
  }
}

let dir: string;
let destPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'spec027-mem-'));
  destPath = path.join(dir, 'big.xlsx');
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('writeExport (XLSX) — 100k-row streaming memory budget', () => {
  it(
    'stays within the NFR4 live-heap and NFR1 time budgets with useStyles:true',
    async () => {
      // Materialise the FR9-capped input ONCE, BEFORE the baseline snapshot, so
      // it counts as the caller's cost and is excluded from the writer delta.
      const rows: ExportRow[] = Array.from(generateRows(MAX_EXPORT_ROWS));

      forceGc();
      const baselineHeap = process.memoryUsage().heapUsed;
      let peakRetained = baselineHeap;

      const started = Date.now();
      await writeExport({
        rows,
        format: 'xlsx',
        destPath,
        locale: 'es',
        // Sample the GC'd live heap while the writer (and its style table) is
        // still reachable. A per-cell-styling regression grows the retained
        // style table and trips the budget here; transient spikes are GC'd away.
        onProgress: (rowsDone) => {
          if (rowsDone % SAMPLE_EVERY_ROWS !== 0) return;
          forceGc();
          const used = process.memoryUsage().heapUsed;
          if (used > peakRetained) peakRetained = used;
        },
      });
      const elapsed = Date.now() - started;

      const stat = await fs.stat(destPath);
      expect(stat.size).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(NFR1_TIME_BUDGET_MS);
      expect(peakRetained - baselineHeap).toBeLessThan(NFR4_HEAP_BUDGET_BYTES);
    },
    NFR1_TIME_BUDGET_MS + 30_000,
  );
});
