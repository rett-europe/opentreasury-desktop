// Import IPC handlers — WI-17.
//
// Four handlers: stage-file, dry-run, commit, last-mapping.
// All implement the error-envelope pattern (never throw across IPC).
//
// Security hardening (WI-17 sec review):
// - Uses exceljs (not SheetJS/xlsx) — CVE-2023-30533, CVE-2024-22363 mitigated
// - Windows-aware path validation (UNC, device names, symlinks rejected)
// - Opaque file-ID tokens (ULID-based session registry)
// - Row-count cap (100k max) for zip-bomb mitigation
// - Parser safety flags (formula disable, header sanitization)

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ExcelJS from 'exceljs';
import * as Papa from 'papaparse';
import type { EventLog } from '../../../core/eventLog/index.js';
import type {
  MovementImportedEvent,
  ImportMappingUpdatedEvent,
} from '../../../core/events/schemas.js';
import { applyEvent as coreApplyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  stageFileRequestSchema,
  type StageFileResponse,
  dryRunRequestSchema,
  type DryRunResponse,
  commitImportRequestSchema,
  type CommitImportResponse,
  lastMappingRequestSchema,
  type LastMappingResponse,
  type ColumnMapping,
} from '../../../shared/ipc-contracts/import.js';
import { computeRowHash } from '../../import/rowHash.js';
import { detectDateFormat } from '../../import/dateFormat.js';
import { parseDate, parseAmount } from '../../import/parser.js';
import { validateFilePath } from '../../import/pathGuard.js';
import { detectHeaderRow } from '../../import/headerDetection.js';
import { classifyRow } from '../../import/rowClassification.js';
import {
  stageFile as registerFileId,
  resolveFileId,
  evictFileId,
} from '../../import/sessionFileRegistry.js';
import { sanitizeCell } from '../../import/cellSanitizer.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (pre-decompression)
const MAX_ROW_COUNT = 100_000; // Row-count cap for zip-bomb mitigation

export interface ImportHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly applyEvent?: typeof coreApplyEvent;
}

interface ParsedRow {
  rowIndex: number;
  date: string | undefined;
  amount: number | undefined;
  type: 'income' | 'expense' | undefined;
  description: string | undefined;
  rowHash: string | undefined;
  isDuplicate: boolean | undefined;
  // WI-19 — pass through mapped reference/details (already normalized:
  // trim + empty→null + clamped to max length). Always present on valid rows.
  reference: string | null;
  details: string | null;
  errors: Array<{
    field: 'date' | 'amount' | 'description';
    code: string;
    raw?: string;
    offending?: string;
  }>;
}

// ============================================================================
// import:stage-file handler
// ============================================================================

export function createStageFileHandler(
  _deps: Pick<ImportHandlerDeps, 'getReadModel'>,
): (raw: unknown) => Promise<StageFileResponse> {
  return async function handleStageFile(raw: unknown): Promise<StageFileResponse> {
    try {
      const parsed = stageFileRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const { filePath, headerRow: headerRowOverride } = parsed.data;

      // Validate path (Windows-aware: UNC, device names, symlinks, traversal)
      const validation = validateFilePath(filePath);
      if (!validation.ok) {
        return {
          ok: false,
          error: { code: 'PATH_INVALID', detail: validation.reason },
        };
      }

      const normalizedPath = validation.normalized;

      // Check file size (pre-decompression)
      let stats: fs.Stats;
      try {
        stats = fs.statSync(normalizedPath);
      } catch {
        return {
          ok: false,
          error: { code: 'FILE_UNREADABLE', detail: 'File not found or not accessible' },
        };
      }

      if (stats.size > MAX_FILE_SIZE) {
        return {
          ok: false,
          error: {
            code: 'FILE_TOO_LARGE',
            detail: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB limit`,
          },
        };
      }

      const ext = path.extname(normalizedPath).toLowerCase();

      let result: StageFileResponse;
      if (ext === '.csv') {
        result = await handleCsvStaging(normalizedPath, headerRowOverride);
      } else if (ext === '.xlsx' || ext === '.xls') {
        result = await handleXlsxStaging(normalizedPath, headerRowOverride);
      } else {
        return {
          ok: false,
          error: {
            code: 'FILE_UNREADABLE',
            detail: 'Unsupported file format (only .csv and .xlsx supported)',
          },
        };
      }

      // If staging succeeded, register file and return fileId
      if (result.ok) {
        const fileId = registerFileId(normalizedPath);
        return {
          ok: true,
          fileId,
          sheets: result.sheets,
        };
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', detail: message } };
    }
  };
}

const PREVIEW_ROWS = 20;

function deriveColumnHeaders(headerRowCells: string[], totalCols: number): string[] {
  const headers: string[] = [];
  const width = Math.max(headerRowCells.length, totalCols);
  for (let i = 0; i < width; i++) {
    const raw = (headerRowCells[i] ?? '').trim();
    headers.push(raw || `Column ${i + 1}`);
  }
  return headers;
}

async function handleCsvStaging(
  filePath: string,
  headerRowOverride: number | undefined,
): Promise<StageFileResponse> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parser safety: dynamicTyping: false (CVE mitigation), skipEmptyLines: true.
    // Parse all rows as arrays (no header mode) so we can detect the header row.
    const allRows: string[][] = [];
    let aborted = false;

    Papa.parse<string[]>(content, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      step: (result) => {
        if (allRows.length >= MAX_ROW_COUNT) {
          aborted = true;
          return;
        }
        const row = Array.isArray(result.data) ? (result.data as unknown[]) : [];
        allRows.push(row.map((c) => sanitizeCell(c, { stripControlChars: true, maxLength: 500 })));
      },
    });

    if (aborted) {
      return {
        ok: false,
        error: {
          code: 'ROW_COUNT_EXCEEDED',
          detail: `File exceeds maximum row limit (${MAX_ROW_COUNT} rows)`,
        },
      };
    }

    if (allRows.length === 0) {
      return {
        ok: false,
        error: { code: 'FILE_UNREADABLE', detail: 'CSV is empty' },
      };
    }

    const previewRows = allRows.slice(0, PREVIEW_ROWS);
    const detectedHeaderRow = detectHeaderRow(previewRows);
    const effectiveHeaderRow =
      headerRowOverride && headerRowOverride <= previewRows.length
        ? headerRowOverride
        : detectedHeaderRow;

    const headerCells = previewRows[effectiveHeaderRow - 1] ?? [];
    const totalCols = allRows.reduce((max, r) => Math.max(max, r.length), 0);
    const columnHeaders = deriveColumnHeaders(headerCells, totalCols);

    if (columnHeaders.length < 3) {
      return {
        ok: false,
        error: { code: 'INSUFFICIENT_COLUMNS', detail: 'CSV must have at least 3 columns' },
      };
    }

    const dataRowCount = Math.max(0, allRows.length - effectiveHeaderRow);

    return {
      ok: true,
      fileId: '', // Will be set by caller
      sheets: [
        {
          name: 'Sheet1',
          columnHeaders,
          rowCount: dataRowCount,
          detectedHeaderRow,
          previewRows,
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: 'FILE_UNREADABLE', detail: `CSV read error: ${message}` },
    };
  }
}

async function handleXlsxStaging(
  filePath: string,
  headerRowOverride: number | undefined,
): Promise<StageFileResponse> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheets = workbook.worksheets.map((worksheet) => {
      const sheetName = worksheet.name;

      // Row-count cap for zip-bomb mitigation
      if (worksheet.rowCount > MAX_ROW_COUNT) {
        throw new Error(`Sheet "${sheetName}" exceeds maximum row limit (${MAX_ROW_COUNT} rows)`);
      }

      if (worksheet.rowCount === 0) {
        return {
          name: sheetName,
          columnHeaders: [],
          rowCount: 0,
          detectedHeaderRow: 1,
          previewRows: [] as string[][],
        };
      }

      // Collect the first PREVIEW_ROWS rows as raw string[] arrays.
      const previewRows: string[][] = [];
      const limit = Math.min(worksheet.rowCount, PREVIEW_ROWS);
      let maxCols = 0;
      for (let r = 1; r <= limit; r++) {
        const row = worksheet.getRow(r);
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          cells.push(sanitizeCell(cell.value, { stripControlChars: true, maxLength: 500 }));
        });
        maxCols = Math.max(maxCols, cells.length);
        previewRows.push(cells);
      }

      const detectedHeaderRow = detectHeaderRow(previewRows);
      const effectiveHeaderRow =
        headerRowOverride && headerRowOverride <= previewRows.length
          ? headerRowOverride
          : detectedHeaderRow;

      const headerCells = previewRows[effectiveHeaderRow - 1] ?? [];
      // For totalCols, also consider actual sheet column count.
      const totalCols = Math.max(maxCols, worksheet.columnCount || 0);
      const columnHeaders = deriveColumnHeaders(headerCells, totalCols);

      const dataRowCount = Math.max(0, worksheet.rowCount - effectiveHeaderRow);

      return {
        name: sheetName,
        columnHeaders,
        rowCount: dataRowCount,
        detectedHeaderRow,
        previewRows,
      };
    });

    return {
      ok: true,
      fileId: '', // Will be set by caller
      sheets,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Check if it's a row-count exceeded error
    if (message.includes('exceeds maximum row limit')) {
      return {
        ok: false,
        error: { code: 'ROW_COUNT_EXCEEDED', detail: message },
      };
    }

    return {
      ok: false,
      error: { code: 'FILE_UNREADABLE', detail: `XLSX read error: ${message}` },
    };
  }
}

// ============================================================================
// import:dry-run handler
// ============================================================================

export function createDryRunHandler(
  deps: Pick<ImportHandlerDeps, 'getReadModel'>,
): (raw: unknown) => Promise<DryRunResponse> {
  return async function handleDryRun(raw: unknown): Promise<DryRunResponse> {
    try {
      const parsed = dryRunRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const { fileId, sheetName, accountId, columnMapping, headerRow } = parsed.data;

      // Resolve fileId to real path
      const filePath = resolveFileId(fileId);
      if (!filePath) {
        return {
          ok: false,
          error: { code: 'FILE_UNREADABLE', detail: 'Invalid or expired file session' },
        };
      }

      // Load and parse file
      const rows = await loadFileRows(filePath, sheetName, columnMapping, headerRow);
      if (!rows.ok) {
        return { ok: false, error: rows.error };
      }

      // Detect date format from sample
      const dateSamples = rows.data
        .slice(0, 10)
        .map((r) => r.rawDate)
        .filter(Boolean);
      const dateFormatResult = detectDateFormat(dateSamples);

      // 2-of-3 junk rule: classify each row first. Silently drop "skip"
      // rows (trailing summaries, blanks); keep "error" + "import" rows.
      const classified = rows.data.map((row) => ({
        row,
        classification: classifyRow(
          {
            [columnMapping.date]: row.rawDate,
            [columnMapping.amount]: row.rawAmount,
            [columnMapping.description]: row.rawDescription,
          },
          columnMapping,
          dateFormatResult.format,
        ),
      }));

      const retained = classified.filter((r) => r.classification !== 'skip');

      // Parse all retained rows
      const parsedRows = retained.map(({ row }) =>
        parseRow(row, accountId, columnMapping, dateFormatResult.format, deps.getReadModel),
      );

      // Collect results
      const validRows = parsedRows.filter((r) => r.errors.length === 0);
      const duplicates = validRows.filter((r) => r.isDuplicate);
      const errors = parsedRows.filter((r) => r.errors.length > 0);

      const samples = validRows.slice(0, 5).map((r) => ({
        rowIndex: r.rowIndex,
        date: r.date!,
        amount: r.amount!,
        description: r.description!,
        isDuplicate: r.isDuplicate ?? false,
      }));

      const duplicateList = duplicates.map((r) => ({
        rowIndex: r.rowIndex,
        date: r.date!,
        amount: r.amount!,
        description: r.description!,
        rowHash: r.rowHash!,
      }));

      const errorList = errors.flatMap((r) =>
        r.errors.map((e) => ({
          row: r.rowIndex,
          field: e.field,
          code: e.code,
          raw: e.raw,
          offending: e.offending,
        })),
      );

      return {
        ok: true,
        summary: {
          totalRows: retained.length,
          validRows: validRows.length,
          duplicateCount: duplicates.length,
          errorCount: errors.length,
        },
        samples,
        duplicates: duplicateList,
        errors: errorList,
        inferredDateFormat: dateFormatResult.format,
        dateFormatAmbiguous: dateFormatResult.ambiguous,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', detail: message } };
    }
  };
}

// ============================================================================
// import:commit handler
// ============================================================================

export function createCommitHandler(
  deps: ImportHandlerDeps,
): (raw: unknown) => Promise<CommitImportResponse> {
  const apply = deps.applyEvent ?? coreApplyEvent;

  return async function handleCommit(raw: unknown): Promise<CommitImportResponse> {
    try {
      const parsed = commitImportRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'SCHEMA_INVALID',
            detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        };
      }

      const { fileId, sheetName, accountId, columnMapping, importDuplicates, headerRow } =
        parsed.data;

      // Resolve fileId to real path
      const filePath = resolveFileId(fileId);
      if (!filePath) {
        return {
          ok: false,
          error: { code: 'FILE_UNREADABLE', detail: 'Invalid or expired file session' },
        };
      }

      // Load and parse (same as dry-run)
      const rows = await loadFileRows(filePath, sheetName, columnMapping, headerRow);
      if (!rows.ok) {
        return { ok: false, error: rows.error };
      }

      const dateSamples = rows.data
        .slice(0, 10)
        .map((r) => r.rawDate)
        .filter(Boolean);
      const dateFormatResult = detectDateFormat(dateSamples);

      // 2-of-3 junk rule: commit only rows that dry-run classified as
      // "import". "skip" rows vanish silently; "error" rows are not
      // committed (parseRow will flag them and they'd go to errors list).
      const classified = rows.data.map((row) => ({
        row,
        classification: classifyRow(
          {
            [columnMapping.date]: row.rawDate,
            [columnMapping.amount]: row.rawAmount,
            [columnMapping.description]: row.rawDescription,
          },
          columnMapping,
          dateFormatResult.format,
        ),
      }));

      const retained = classified.filter((r) => r.classification !== 'skip');

      const parsedRows = retained.map(({ row }) =>
        parseRow(row, accountId, columnMapping, dateFormatResult.format, deps.getReadModel),
      );

      const validRows = parsedRows.filter((r) => r.errors.length === 0);
      const duplicates = validRows.filter((r) => r.isDuplicate);
      const errors = parsedRows.filter((r) => r.errors.length > 0);

      // Determine which rows to import
      const rowsToImport = importDuplicates ? validRows : validRows.filter((r) => !r.isDuplicate);

      const importBatchId = deps.newId();
      const sourceFileName = path.basename(filePath);
      const events: (MovementImportedEvent | ImportMappingUpdatedEvent)[] = [];

      // Build movement.imported events
      for (const row of rowsToImport) {
        const event: MovementImportedEvent = {
          type: 'movement.imported',
          id: deps.newId(),
          date: row.date!,
          movementType: row.type!,
          amount: row.amount!,
          currency: 'EUR',
          description: row.description!,
          accountId,
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'pending',
          createdAt: deps.now().toISOString(),
          rowHash: row.rowHash!,
          sourceFileName,
          importBatchId,
          rowIndex: row.rowIndex,
          // WI-19 — persist per-row reference/details when mapped.
          reference: row.reference,
          details: row.details,
        };
        events.push(event);
      }

      // Build import.mapping.updated event
      const mappingEvent: ImportMappingUpdatedEvent = {
        type: 'import.mapping.updated',
        id: deps.newId(),
        accountId,
        dateColumn: columnMapping.date,
        amountColumn: columnMapping.amount,
        descriptionColumn: columnMapping.description,
        updatedAt: deps.now().toISOString(),
      };
      events.push(mappingEvent);

      // Append all events
      const before = (await deps.eventLog.load()).length;
      for (const evt of events) {
        await deps.eventLog.append(evt);
      }
      const after = (await deps.eventLog.load()).length;

      // Apply to read model if log grew
      if (after > before) {
        for (const evt of events) {
          apply(evt);
        }
      }

      // Evict file from session registry after successful commit
      evictFileId(fileId);

      const warnings = errors.flatMap((r) =>
        r.errors.map((e) => ({
          row: r.rowIndex,
          field: e.field,
          code: e.code,
          raw: e.raw,
        })),
      );

      return {
        ok: true,
        importBatchId,
        importedCount: rowsToImport.length,
        skippedCount: duplicates.length,
        warnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'INTERNAL', detail: message } };
    }
  };
}

// ============================================================================
// import:last-mapping handler
// ============================================================================

export function createLastMappingHandler(
  deps: Pick<ImportHandlerDeps, 'getReadModel'>,
): (raw: unknown) => Promise<LastMappingResponse> {
  return async function handleLastMapping(raw: unknown): Promise<LastMappingResponse> {
    const parsed = lastMappingRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return { mapping: null, updatedAt: null };
    }

    const { accountId } = parsed.data;
    const model = deps.getReadModel();
    const mapping = model.importMappings.find((m) => m.accountId === accountId);

    if (!mapping) {
      return { mapping: null, updatedAt: null };
    }

    return {
      mapping: {
        date: mapping.dateColumn,
        amount: mapping.amountColumn,
        description: mapping.descriptionColumn,
      },
      updatedAt: mapping.updatedAt,
    };
  };
}

// ============================================================================
// Helpers
// ============================================================================

interface RawRow {
  rowIndex: number;
  rawDate: string;
  rawAmount: string;
  rawDescription: string;
  // WI-19 — optional per-row raw values for mappable free-text columns.
  rawReference: string;
  rawDetails: string;
}

interface LoadRowsResult {
  ok: true;
  data: RawRow[];
}

interface LoadRowsError {
  ok: false;
  error: {
    code: 'FILE_UNREADABLE' | 'SHEET_NOT_FOUND' | 'PARSE_ERROR' | 'ROW_COUNT_EXCEEDED';
    detail: string;
  };
}

async function loadFileRows(
  filePath: string,
  sheetName: string | undefined,
  mapping: ColumnMapping,
  headerRow: number,
): Promise<LoadRowsResult | LoadRowsError> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return loadCsvRows(filePath, mapping, headerRow);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return loadXlsxRows(filePath, sheetName ?? 'Sheet1', mapping, headerRow);
  }

  return {
    ok: false,
    error: { code: 'FILE_UNREADABLE', detail: 'Unsupported file format' },
  };
}

function loadCsvRows(
  filePath: string,
  mapping: ColumnMapping,
  headerRow: number,
): LoadRowsResult | LoadRowsError {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parse as arrays (header: false) so we can honor an arbitrary header
    // row position chosen by the user (or the auto-detector).
    const allRows: string[][] = [];
    let aborted = false;

    Papa.parse<string[]>(content, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      step: (result) => {
        if (allRows.length >= MAX_ROW_COUNT) {
          aborted = true;
          return;
        }
        const row = Array.isArray(result.data) ? (result.data as unknown[]) : [];
        allRows.push(row.map((c) => (c === null || c === undefined ? '' : String(c))));
      },
    });

    if (aborted) {
      return {
        ok: false,
        error: {
          code: 'ROW_COUNT_EXCEEDED',
          detail: `File exceeds maximum row limit (${MAX_ROW_COUNT} rows)`,
        },
      };
    }

    if (headerRow < 1 || headerRow > allRows.length) {
      return {
        ok: false,
        error: { code: 'PARSE_ERROR', detail: `Header row ${headerRow} out of range` },
      };
    }

    const headers = (allRows[headerRow - 1] ?? []).map((h) => h.trim());
    const dateIdx = headers.indexOf(mapping.date);
    const amountIdx = headers.indexOf(mapping.amount);
    const descriptionIdx = headers.indexOf(mapping.description);
    // WI-19 — optional reference/details column indices (-1 when unmapped).
    const referenceIdx = mapping.reference ? headers.indexOf(mapping.reference) : -1;
    const detailsIdx = mapping.details ? headers.indexOf(mapping.details) : -1;

    if (dateIdx < 0 || amountIdx < 0 || descriptionIdx < 0) {
      return {
        ok: false,
        error: { code: 'PARSE_ERROR', detail: 'Column mapping not found in sheet headers' },
      };
    }

    const rows: RawRow[] = [];
    for (let i = headerRow; i < allRows.length; i++) {
      const r = allRows[i] ?? [];
      rows.push({
        rowIndex: i - headerRow + 1,
        rawDate: r[dateIdx] ?? '',
        rawAmount: r[amountIdx] ?? '',
        rawDescription: r[descriptionIdx] ?? '',
        rawReference: referenceIdx >= 0 ? (r[referenceIdx] ?? '') : '',
        rawDetails: detailsIdx >= 0 ? (r[detailsIdx] ?? '') : '',
      });
    }

    return { ok: true, data: rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: 'FILE_UNREADABLE', detail: `CSV read error: ${message}` },
    };
  }
}

async function loadXlsxRows(
  filePath: string,
  sheetName: string,
  mapping: ColumnMapping,
  headerRow: number,
): Promise<LoadRowsResult | LoadRowsError> {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      return {
        ok: false,
        error: { code: 'SHEET_NOT_FOUND', detail: `Sheet "${sheetName}" not found` },
      };
    }

    // Row-count cap for zip-bomb mitigation
    if (worksheet.rowCount > MAX_ROW_COUNT) {
      return {
        ok: false,
        error: {
          code: 'ROW_COUNT_EXCEEDED',
          detail: `Sheet exceeds maximum row limit (${MAX_ROW_COUNT} rows)`,
        },
      };
    }

    if (worksheet.rowCount < headerRow + 1) {
      return { ok: true, data: [] };
    }

    // Get header row to find column indices
    const headerCells = worksheet.getRow(headerRow);
    const headers: string[] = [];
    headerCells.eachCell({ includeEmpty: true }, (cell) => {
      const value = cell.value;
      let header = '';

      if (value !== null && value !== undefined) {
        if (typeof value === 'string') {
          header = value;
        } else if (typeof value === 'number') {
          header = String(value);
        } else if (typeof value === 'object' && 'text' in value) {
          header = String(value.text);
        } else {
          header = String(value);
        }
      }

      headers.push(header.trim());
    });

    const dateIdx = headers.indexOf(mapping.date);
    const amountIdx = headers.indexOf(mapping.amount);
    const descriptionIdx = headers.indexOf(mapping.description);
    // WI-19 — optional reference/details column indices (-1 when unmapped).
    const referenceIdx = mapping.reference ? headers.indexOf(mapping.reference) : -1;
    const detailsIdx = mapping.details ? headers.indexOf(mapping.details) : -1;

    if (dateIdx < 0 || amountIdx < 0 || descriptionIdx < 0) {
      return {
        ok: false,
        error: { code: 'PARSE_ERROR', detail: 'Column mapping not found in sheet headers' },
      };
    }

    const rows: RawRow[] = [];
    let rowIndex = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return; // Skip preamble + header

      rowIndex++;

      const dateCell = row.getCell(dateIdx + 1); // ExcelJS is 1-indexed
      const amountCell = row.getCell(amountIdx + 1);
      const descriptionCell = row.getCell(descriptionIdx + 1);

      // Extract cell values, handling Date objects from exceljs
      let rawDate = '';
      if (dateCell.value instanceof Date) {
        // ExcelJS returns Date objects directly for date cells
        const isoString = dateCell.value.toISOString();
        rawDate = isoString.substring(0, 10); // YYYY-MM-DD (first 10 chars)
      } else if (dateCell.value !== null && dateCell.value !== undefined) {
        rawDate = sanitizeCell(dateCell.value);
      }

      // WI-19 — reference/details are only read when mapped. Unmapped → ''.
      const referenceCell = referenceIdx >= 0 ? row.getCell(referenceIdx + 1) : null;
      const detailsCell = detailsIdx >= 0 ? row.getCell(detailsIdx + 1) : null;

      rows.push({
        rowIndex,
        rawDate,
        rawAmount: sanitizeCell(amountCell.value),
        rawDescription: sanitizeCell(descriptionCell.value),
        rawReference: referenceCell ? sanitizeCell(referenceCell.value) : '',
        rawDetails: detailsCell ? sanitizeCell(detailsCell.value) : '',
      });
    });

    return { ok: true, data: rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { code: 'FILE_UNREADABLE', detail: `XLSX read error: ${message}` },
    };
  }
}

function parseRow(
  row: RawRow,
  accountId: string,
  _mapping: ColumnMapping,
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD',
  getReadModel: () => ReadModel,
): ParsedRow {
  const errors: Array<{
    field: 'date' | 'amount' | 'description';
    code: string;
    raw?: string;
    offending?: string;
  }> = [];

  // Parse date
  const dateResult = parseDate(row.rawDate, dateFormat);
  if (!dateResult.success) {
    const dateError: {
      field: 'date' | 'amount' | 'description';
      code: string;
      raw?: string;
      offending?: string;
    } = {
      field: 'date',
      code: dateResult.errorCode || 'DATE_INVALID',
    };
    const rawDate = dateResult.errorRaw ?? (row.rawDate !== undefined ? String(row.rawDate) : '');
    if (rawDate !== '') {
      dateError.raw = rawDate;
    }
    errors.push(dateError);
  }

  // Parse amount
  const amountResult = parseAmount(row.rawAmount);
  if (!amountResult.success) {
    const error: {
      field: 'date' | 'amount' | 'description';
      code: string;
      raw?: string;
      offending?: string;
    } = {
      field: 'amount',
      code: amountResult.errorCode || 'INVALID_AMOUNT',
    };
    if (amountResult.errorRaw !== undefined) {
      error.raw = amountResult.errorRaw;
    }
    if (amountResult.errorOffending !== undefined) {
      error.offending = amountResult.errorOffending;
    }
    errors.push(error);
  }

  // Parse description
  const description = row.rawDescription.trim();
  if (!description) {
    errors.push({
      field: 'description',
      code: 'EMPTY',
      raw: String(row.rawDescription ?? ''),
    });
  }

  // WI-19 — normalize reference/details: trim, empty→null, clamp to max len.
  const normalizeFreeText = (value: string, maxLen: number): string | null => {
    const trimmed = (value ?? '').trim();
    if (trimmed === '') return null;
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  };
  const reference = normalizeFreeText(row.rawReference, 120);
  const details = normalizeFreeText(row.rawDetails, 1000);

  // If any field failed, return early
  if (errors.length > 0) {
    return {
      rowIndex: row.rowIndex,
      date: undefined,
      amount: undefined,
      type: undefined,
      description: undefined,
      rowHash: undefined,
      isDuplicate: undefined,
      reference,
      details,
      errors,
    };
  }

  // Compute row hash and check for duplicates
  const rowHash = computeRowHash(accountId, dateResult.date!, amountResult.amount!, description);
  const isDuplicate = getReadModel().rowHashes.has(rowHash);

  return {
    rowIndex: row.rowIndex,
    date: dateResult.date,
    amount: amountResult.amount,
    type: amountResult.type,
    description,
    rowHash,
    isDuplicate,
    reference,
    details,
    errors: [],
  };
}
