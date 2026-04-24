// Issue #39 — Phase 1 perf harness (measurement side).
//
// Exercises the REAL code paths from the main-process data layer at
// multiple transaction counts and reports per-stage wall time. Imports
// the production modules directly via `vite-node` — no re-implementation,
// so the numbers reflect the actual code in app/src, not an approximation.
//
// Stages measured (per N):
//   1. NDJSON disk read         — fs.readFile of events.ndjson
//   2. JsonFileEventLog.load()  — includes split + JSON.parse + id extraction
//                                 (app/src/core/eventLog/JsonFileEventLog.ts L101-L150)
//   3. replayEvents()           — reducer fold into the in-memory ReadModel
//                                 (app/src/core/query/reducers.ts)
//   4. movements:list handler   — filter + sort + slice + map
//                                 (app/src/main/ipc/handlers/movements.ts L20-L57)
//   5. Zod response .parse()    — IPC boundary validation
//                                 (movementsListResponseSchema — movements.ts L66)
//
// Steps per iteration:
//   a. regenerate the NDJSON file at size N (via perf-seed, in-proc reuse)
//   b. reset the reducer singleton (replayEvents replaces, doesn't merge)
//   c. run each stage, record median of --trials runs
//
// Usage:
//   npm run perf:measure                # defaults: sizes=[1000,2500,5000,10000], trials=5
//   npm run perf:measure -- --sizes=2500,10000 --trials=3
//
// Output:
//   - Markdown table on stdout
//   - Optional `--report=<path>` writes the same table to a .md file

import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JsonFileEventLog } from '../app/src/core/eventLog/JsonFileEventLog.js';
import type { DomainEvent } from '../app/src/core/eventLog/EventLog.js';
import { replayEvents, getReadModel } from '../app/src/core/query/reducers.js';
import { createMovementsListHandler } from '../app/src/main/ipc/handlers/movements.js';
import { movementsListResponseSchema } from '../app/src/shared/ipc-contracts/movements.js';

// ── flag parsing ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a) => {
    if (!a.startsWith('--')) return [];
    const [k, v = 'true'] = a.slice(2).split('=');
    return [[k, v]];
  }),
);

const sizes = (args.sizes ?? '1000,2500,5000,10000')
  .split(',')
  .map((s: string) => Number.parseInt(s.trim(), 10))
  .filter((n: number) => Number.isFinite(n) && n > 0);
const trials = Math.max(1, Number.parseInt(args.trials ?? '5', 10));
const reportPath: string | undefined = args.report;

// ── tiny timer ──────────────────────────────────────────────────────────────
function time<T>(label: string, fn: () => T): { ms: number; value: T } {
  const start = performance.now();
  const value = fn();
  const ms = performance.now() - start;
  return { ms, value };
}

async function timeAsync<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  const ms = performance.now() - start;
  return { ms, value };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ── re-seed helper ─────────────────────────────────────────────────────────
// Spawn the existing perf-seed.mjs so the NDJSON layout matches 1:1 what a
// real user would have on disk. Using child_process.spawn (not require) keeps
// the seed script standalone + observable.
import { spawnSync } from 'node:child_process';
function seed(count: number, out: string): void {
  const r = spawnSync(
    process.execPath,
    ['scripts/perf-seed.mjs', `--count=${count}`, `--out=${out}`],
    { stdio: 'pipe', encoding: 'utf8' },
  );
  if (r.status !== 0) {
    throw new Error(`perf-seed failed: ${r.stderr}`);
  }
}

// ── reset reducer state between runs ───────────────────────────────────────
// replayEvents replaces, not merges, the in-memory read model (see
// app/src/core/query/reducers.ts). Calling it with [] clears state.

interface StageResult {
  size: number;
  fileSizeKiB: number;
  readMs: number;
  loadMs: number; // includes read
  replayMs: number;
  handlerMs: number;
  zodMs: number;
  totalMs: number; // load + replay + handler + zod (mirrors cold-mount IPC path)
  rowCount: number;
}

async function measureOnce(size: number): Promise<StageResult> {
  const dir = await fs.mkdtemp(join(tmpdir(), 'ot-perf-'));
  const file = join(dir, 'events.ndjson');
  try {
    seed(size, file);

    const stat = await fs.stat(file);

    // Stage 1: raw disk read (baseline)
    const readOnce = await timeAsync('fs.readFile', () => fs.readFile(file, 'utf8'));

    // Stage 2: full JsonFileEventLog.load() (read + parse + id extract)
    const log = new JsonFileEventLog({ dir });
    const loaded = await timeAsync('load', () => log.load());
    const events = loaded.value as DomainEvent[];

    // Stage 3: replay reducer
    const replay = time('replay', () => replayEvents(events));

    // Stage 4: movements:list handler (simulates an IPC call with no filters)
    const handler = createMovementsListHandler({ getReadModel });
    const handlerRun = await timeAsync('handler', () => handler({}));
    const records = handlerRun.value;

    // Stage 5: Zod response parse at IPC boundary
    const zod = time('zod', () => movementsListResponseSchema.parse(records));

    return {
      size,
      fileSizeKiB: stat.size / 1024,
      readMs: readOnce.ms,
      loadMs: loaded.ms,
      replayMs: replay.ms,
      handlerMs: handlerRun.ms,
      zodMs: zod.ms,
      totalMs: loaded.ms + replay.ms + handlerRun.ms + zod.ms,
      rowCount: records.length,
    };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

async function measure(size: number, trials: number): Promise<StageResult> {
  const runs: StageResult[] = [];
  for (let i = 0; i < trials; i++) {
    // Reset reducer between trials — replayEvents([]) empties the singleton.
    replayEvents([]);
    runs.push(await measureOnce(size));
  }
  // Return a synthetic result using per-stage medians (more robust than mean).
  return {
    size,
    fileSizeKiB: runs[0].fileSizeKiB,
    readMs: median(runs.map((r) => r.readMs)),
    loadMs: median(runs.map((r) => r.loadMs)),
    replayMs: median(runs.map((r) => r.replayMs)),
    handlerMs: median(runs.map((r) => r.handlerMs)),
    zodMs: median(runs.map((r) => r.zodMs)),
    totalMs: median(runs.map((r) => r.totalMs)),
    rowCount: runs[0].rowCount,
  };
}

function fmtMs(ms: number): string {
  if (ms < 1) return ms.toFixed(2);
  if (ms < 10) return ms.toFixed(1);
  return Math.round(ms).toString();
}

function table(results: StageResult[]): string {
  const rows = [
    '| N tx | File (KiB) | fs.readFile | load() | replayEvents | movements:list | zod.parse | **Total** |',
    '| ---: | ---------: | ----------: | -----: | -----------: | -------------: | --------: | --------: |',
    ...results.map(
      (r) =>
        `| ${r.size.toLocaleString()} | ${Math.round(r.fileSizeKiB).toLocaleString()} | ${fmtMs(r.readMs)} ms | ${fmtMs(r.loadMs)} ms | **${fmtMs(r.replayMs)} ms** | ${fmtMs(r.handlerMs)} ms | ${fmtMs(r.zodMs)} ms | **${fmtMs(r.totalMs)} ms** |`,
    ),
  ];
  return rows.join('\n');
}

// ── main ────────────────────────────────────────────────────────────────────
const results: StageResult[] = [];
for (const size of sizes) {
  // eslint-disable-next-line no-console
  console.log(`[perf-measure] N=${size} (${trials} trials)…`);
  results.push(await measure(size, trials));
}

const host = `node=${process.version} platform=${process.platform} arch=${process.arch}`;
const header = [
  '## Data-layer perf (main-process only — no renderer)',
  '',
  `Host: ${host}`,
  `Trials per size: ${trials} (cell = median)`,
  `Source: \`scripts/perf-measure.ts\` (run: \`npm run perf:measure\`)`,
  '',
  'Column meaning:',
  '- **fs.readFile** — raw disk read of `events.ndjson`',
  '- **load()** — `JsonFileEventLog.load()` (read + NDJSON parse + id extract)',
  '- **replayEvents** — reducer fold into the `ReadModel` singleton',
  '- **movements:list** — `createMovementsListHandler({})` with no filters (filter + sort + slice + map, 12 fields × N rows)',
  '- **zod.parse** — `movementsListResponseSchema.parse(records)` (IPC boundary validation)',
  '- **Total** — sum of load + replay + handler + zod (mirrors what happens between an IPC call arriving and the response being sent)',
  '',
].join('\n');

const output = header + '\n' + table(results) + '\n';

// eslint-disable-next-line no-console
console.log('\n' + output);

if (reportPath) {
  await fs.writeFile(reportPath, output, { encoding: 'utf8' });
  // eslint-disable-next-line no-console
  console.log(`[perf-measure] wrote report → ${reportPath}`);
}
