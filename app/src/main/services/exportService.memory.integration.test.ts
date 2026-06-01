// SPEC-027 §14 — 100k-row XLSX streaming memory/time test (AC25 / NFR6 / NFR4).
//
// Exports the FR9 cap (100 000 rows) through the styled (`useStyles: true`)
// streaming writer and asserts the peak heap stays within the NFR4 budget
// (≤ +150 MB over baseline) and the run stays within the NFR1 time budget. This
// guards against a regression where per-cell styling (rather than the
// column-level/shared styling mandated by NFR6) would inflate the shared-style
// table and the heap at scale.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { writeExport } from './exportService.js';
import { MAX_EXPORT_ROWS, type ExportRow } from '../../core/export/types.js';

const NFR4_HEAP_BUDGET_BYTES = 150 * 1024 * 1024;
const NFR1_TIME_BUDGET_MS = 60_000; // generous CI ceiling; NFR1's 10s bar is for 10k rows.

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
    'stays within the NFR4 heap and NFR1 time budgets with useStyles:true',
    async () => {
      const rows = Array.from(generateRows(MAX_EXPORT_ROWS));

      if (typeof global.gc === 'function') global.gc();
      const baseline = process.memoryUsage().heapUsed;
      let peak = baseline;

      const sampler = setInterval(() => {
        const used = process.memoryUsage().heapUsed;
        if (used > peak) peak = used;
      }, 25);

      const started = Date.now();
      try {
        await writeExport({ rows, format: 'xlsx', destPath, locale: 'es' });
      } finally {
        clearInterval(sampler);
      }
      const elapsed = Date.now() - started;

      const stat = await fs.stat(destPath);
      expect(stat.size).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(NFR1_TIME_BUDGET_MS);
      expect(peak - baseline).toBeLessThan(NFR4_HEAP_BUDGET_BYTES);
    },
    NFR1_TIME_BUDGET_MS + 30_000,
  );
});
