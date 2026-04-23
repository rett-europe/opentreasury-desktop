// import.test.ts — WI-18 handler-level tests for stageFile / dryRun /
// commit exercising header-row detection + 2-of-3 junk rule.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createStageFileHandler, createDryRunHandler, createCommitHandler } from './import';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import type {
  MovementImportedEvent,
  ConfigCategoryCreatedEvent,
  ConfigSubcategoryCreatedEvent,
} from '../../../core/events/schemas';
import { getReadModel, resetReadModel } from '../../../core/query/reducers';

class InMemoryEventLog implements EventLog {
  readonly events: DomainEvent[] = [];
  private readonly seen = new Set<string>();
  async append(event: DomainEvent): Promise<void> {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.events.push(event);
  }
  async load(): Promise<DomainEvent[]> {
    return [...this.events];
  }
}

function idGen(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}_${++i}`;
}

const FIXED_NOW = new Date('2026-04-21T12:00:00.000Z');

let tmpDir: string;

function writeCsv(name: string, content: string): string {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// Sample CSV with a 3-row preamble, then header row 4, then 5 data rows
// + 1 two-of-three "error" row + 1 pure-junk trailing summary.
const CSV_WITH_PREAMBLE = [
  'Bank Export Report,,',
  'Account: 1234-5678,,',
  'Generated: 2026-04-21,,',
  'Date,Amount,Description',
  '15/03/2026,100.00,Salary',
  '16/03/2026,-25.50,Groceries',
  '17/03/2026,42.00,Coffee',
  '18/03/2026,-12.34,ATM',
  '19/03/2026,5.00,Transfer',
  // Real row, but amount is broken → 2-of-3 parseable → "error"
  '20/03/2026,xxx,Refund',
  // Trailing junk: only description set → "skip"
  ',,End of statement',
].join('\n');

// CSV where the header is already at row 1 (no preamble).
const CSV_CLEAN = [
  'Date,Amount,Description',
  '15/03/2026,100.00,Salary',
  '16/03/2026,-25.50,Groceries',
  '17/03/2026,42.00,Coffee',
].join('\n');

beforeEach(() => {
  resetReadModel();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ot-wi18-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('stageFile — header detection + preview', () => {
  it('auto-detects the header row and returns previewRows', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('preamble.csv', CSV_WITH_PREAMBLE);

    const resp = await stageHandle({ filePath });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;

    const sheet = resp.sheets[0]!;
    expect(sheet.detectedHeaderRow).toBe(4);
    expect(sheet.columnHeaders).toEqual(['Date', 'Amount', 'Description']);
    expect(sheet.previewRows.length).toBeGreaterThanOrEqual(4);
    expect(sheet.previewRows[3]).toEqual(['Date', 'Amount', 'Description']);
    // rowCount = total - headerRow
    // total rows in CSV_WITH_PREAMBLE = 11, header at 4 → 7 data rows
    expect(sheet.rowCount).toBe(7);
  });

  it('honors a caller-provided headerRow override', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('clean.csv', CSV_CLEAN);

    // Force header to row 2 (pretending user picked something weird).
    const resp = await stageHandle({ filePath, headerRow: 2 });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    const sheet = resp.sheets[0]!;
    // detectedHeaderRow is still auto-detected; columnHeaders reflect override.
    expect(sheet.detectedHeaderRow).toBe(1);
    expect(sheet.columnHeaders).toEqual(['15/03/2026', '100.00', 'Salary']);
  });

  it('still detects row 1 when no preamble is present', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('clean.csv', CSV_CLEAN);
    const resp = await stageHandle({ filePath });
    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.sheets[0]!.detectedHeaderRow).toBe(1);
    expect(resp.sheets[0]!.rowCount).toBe(3);
  });
});

describe('dryRun — 2-of-3 junk rule', () => {
  it('drops "skip" rows silently, surfaces "error" rows, imports the rest', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('preamble.csv', CSV_WITH_PREAMBLE);
    const stageResp = await stageHandle({ filePath });
    expect(stageResp.ok).toBe(true);
    if (!stageResp.ok) return;

    const dryRunHandle = createDryRunHandler({ getReadModel });
    const resp = await dryRunHandle({
      fileId: stageResp.fileId,
      sheetName: 'Sheet1',
      accountId: 'acc_1',
      columnMapping: { date: 'Date', amount: 'Amount', description: 'Description' },
      importDuplicates: false,
      headerRow: stageResp.sheets[0]!.detectedHeaderRow,
    });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;

    // 5 good rows + 1 error row = 6 retained. Trailing junk "skipped" silently.
    expect(resp.summary.totalRows).toBe(6);
    expect(resp.summary.validRows).toBe(5);
    expect(resp.summary.errorCount).toBe(1);
    expect(resp.errors).toHaveLength(1);
    expect(resp.errors[0]!.field).toBe('amount');
  });

  it('threads mapped reference/details through the preview samples (BUG #4)', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv(
      'withrefs.csv',
      [
        'Date,Amount,Description,Ref,Notes',
        '15/03/2026,100.00,Salary,INV-001,Monthly payroll',
        '16/03/2026,-25.50,Groceries,,',
      ].join('\n'),
    );
    const stageResp = await stageHandle({ filePath });
    expect(stageResp.ok).toBe(true);
    if (!stageResp.ok) return;

    const dryRunHandle = createDryRunHandler({ getReadModel });
    const resp = await dryRunHandle({
      fileId: stageResp.fileId,
      sheetName: 'Sheet1',
      accountId: 'acc_1',
      columnMapping: {
        date: 'Date',
        amount: 'Amount',
        description: 'Description',
        reference: 'Ref',
        details: 'Notes',
      },
      importDuplicates: false,
      headerRow: stageResp.sheets[0]!.detectedHeaderRow,
    });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.samples[0]!.reference).toBe('INV-001');
    expect(resp.samples[0]!.details).toBe('Monthly payroll');
    expect(resp.samples[1]!.reference).toBeNull();
    expect(resp.samples[1]!.details).toBeNull();
  });

  it('rejects a missing headerRow via schema validation', async () => {
    const dryRunHandle = createDryRunHandler({ getReadModel });
    const resp = await dryRunHandle({
      fileId: 'whatever',
      accountId: 'acc_1',
      columnMapping: { date: 'Date', amount: 'Amount', description: 'Description' },
      importDuplicates: false,
      // headerRow missing
    });
    expect(resp.ok).toBe(false);
    if (resp.ok) return;
    expect(resp.error.code).toBe('SCHEMA_INVALID');
  });
});

describe('commit — honors headerRow + junk rule', () => {
  it('commits only "import"-classified rows', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('preamble.csv', CSV_WITH_PREAMBLE);
    const stageResp = await stageHandle({ filePath });
    expect(stageResp.ok).toBe(true);
    if (!stageResp.ok) return;

    const log = new InMemoryEventLog();
    const commitHandle = createCommitHandler({
      eventLog: log,
      getReadModel,
      now: () => FIXED_NOW,
      newId: idGen('E'),
    });

    const resp = await commitHandle({
      fileId: stageResp.fileId,
      sheetName: 'Sheet1',
      accountId: 'acc_1',
      columnMapping: { date: 'Date', amount: 'Amount', description: 'Description' },
      importDuplicates: false,
      confirmed: true,
      headerRow: stageResp.sheets[0]!.detectedHeaderRow,
    });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;

    // 5 good rows imported; 1 error row surfaced as warning; junk row silent.
    expect(resp.importedCount).toBe(5);
    expect(resp.warnings).toHaveLength(1);
    expect(resp.warnings[0]!.field).toBe('amount');

    // Event log: 5 movement.imported + 1 import.mapping.updated.
    const movementEvents = log.events.filter((e) => e.type === 'movement.imported');
    expect(movementEvents).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// Issue #22 — auto-create unknown categories / subcategories on commit
// ---------------------------------------------------------------------------
describe('commit — auto-create unknown taxonomy (issue #22)', () => {
  const CSV_WITH_TAXONOMY = [
    'Date,Amount,Description,Cat,Sub',
    '15/03/2026,100.00,Salary,Ingresos,Nómina',
    '16/03/2026,-25.50,Office supplies,Material,Papelería',
    '17/03/2026,-40.00,Hotel,Material,Papelería',
  ].join('\n');

  it('emits CategoryCreated + SubcategoryCreated before movement.imported when flag is ON', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('taxonomy.csv', CSV_WITH_TAXONOMY);
    const stageResp = await stageHandle({ filePath });
    expect(stageResp.ok).toBe(true);
    if (!stageResp.ok) return;

    const log = new InMemoryEventLog();
    const commitHandle = createCommitHandler({
      eventLog: log,
      getReadModel,
      now: () => FIXED_NOW,
      newId: idGen('E'),
    });

    const resp = await commitHandle({
      fileId: stageResp.fileId,
      sheetName: 'Sheet1',
      accountId: 'acc_1',
      columnMapping: {
        date: 'Date',
        amount: 'Amount',
        description: 'Description',
        category: 'Cat',
        subcategory: 'Sub',
      },
      importDuplicates: false,
      confirmed: true,
      headerRow: stageResp.sheets[0]!.detectedHeaderRow,
      autoCreateUnknownTaxonomy: true,
    });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.importedCount).toBe(3);

    // Event log order: 2 CategoryCreated, 2 SubcategoryCreated (dedup
    // across rows — "Material"/"Papelería" appears twice but creates
    // once), then 3 movement.imported, then mapping.
    const types = log.events.map((e) => e.type);
    const firstMovementIdx = types.indexOf('movement.imported');
    const lastTaxonomyIdx = Math.max(
      types.lastIndexOf('CategoryCreated'),
      types.lastIndexOf('SubcategoryCreated'),
    );
    expect(lastTaxonomyIdx).toBeLessThan(firstMovementIdx);

    const categoriesCreated = log.events.filter(
      (e): e is ConfigCategoryCreatedEvent => e.type === 'CategoryCreated',
    );
    expect(categoriesCreated).toHaveLength(2);
    expect(categoriesCreated.map((e) => e.name).sort()).toEqual(['Ingresos', 'Material']);

    const subcategoriesCreated = log.events.filter(
      (e): e is ConfigSubcategoryCreatedEvent => e.type === 'SubcategoryCreated',
    );
    expect(subcategoriesCreated).toHaveLength(2);
    expect(subcategoriesCreated.map((e) => e.name).sort()).toEqual(['Nómina', 'Papelería']);

    // All movement events carry the freshly created category/subcategory
    // ids (not null).
    const movementEvents = log.events.filter(
      (e): e is MovementImportedEvent => e.type === 'movement.imported',
    );
    for (const mv of movementEvents) {
      expect(mv.categoryId).toBeTruthy();
      expect(mv.subcategoryId).toBeTruthy();
    }

    // Subcategory parent ids must point at the categories we just created.
    const createdCategoryIds = new Set(categoriesCreated.map((e) => e.id));
    for (const sc of subcategoriesCreated) {
      expect(createdCategoryIds.has(sc.parentCategoryId)).toBe(true);
    }
  });

  it('does NOT create anything when flag is OFF (rows import with null taxonomy ids)', async () => {
    const stageHandle = createStageFileHandler({ getReadModel });
    const filePath = writeCsv('taxonomy.csv', CSV_WITH_TAXONOMY);
    const stageResp = await stageHandle({ filePath });
    expect(stageResp.ok).toBe(true);
    if (!stageResp.ok) return;

    const log = new InMemoryEventLog();
    const commitHandle = createCommitHandler({
      eventLog: log,
      getReadModel,
      now: () => FIXED_NOW,
      newId: idGen('E'),
    });

    const resp = await commitHandle({
      fileId: stageResp.fileId,
      sheetName: 'Sheet1',
      accountId: 'acc_1',
      columnMapping: {
        date: 'Date',
        amount: 'Amount',
        description: 'Description',
        category: 'Cat',
        subcategory: 'Sub',
      },
      importDuplicates: false,
      confirmed: true,
      headerRow: stageResp.sheets[0]!.detectedHeaderRow,
      autoCreateUnknownTaxonomy: false,
    });

    expect(resp.ok).toBe(true);
    if (!resp.ok) return;
    expect(resp.importedCount).toBe(3);
    expect(log.events.filter((e) => e.type === 'CategoryCreated')).toHaveLength(0);
    expect(log.events.filter((e) => e.type === 'SubcategoryCreated')).toHaveLength(0);

    const movementEvents = log.events.filter(
      (e): e is MovementImportedEvent => e.type === 'movement.imported',
    );
    for (const mv of movementEvents) {
      expect(mv.categoryId).toBeNull();
      expect(mv.subcategoryId).toBeNull();
    }
  });
});
