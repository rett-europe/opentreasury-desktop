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
import {
  stageFile as registerFileId,
  resolveFileId,
  evictFileId,
} from '../../import/sessionFileRegistry.js';

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
  errors: Array<{ field: 'date' | 'amount' | 'description'; reason: string }>;
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

      const { filePath } = parsed.data;

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
        result = await handleCsvStaging(normalizedPath);
      } else if (ext === '.xlsx' || ext === '.xls') {
        result = await handleXlsxStaging(normalizedPath);
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

async function handleCsvStaging(filePath: string): Promise<StageFileResponse> {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parser safety: dynamicTyping: false (CVE mitigation), skipEmptyLines: true
    const result = Papa.parse(content, {
      header: false,
      dynamicTyping: false,
      skipEmptyLines: true,
      preview: 1, // Just get headers
    });

    if (result.errors.length > 0 && result.errors[0]) {
      return {
        ok: false,
        error: { code: 'FILE_UNREADABLE', detail: `CSV parse error: ${result.errors[0].message}` },
      };
    }

    const headers = result.data[0] as string[];
    if (!Array.isArray(headers) || headers.length < 3) {
      return {
        ok: false,
        error: { code: 'INSUFFICIENT_COLUMNS', detail: 'CSV must have at least 3 columns' },
      };
    }

    // Sanitize headers: strip control chars, cap length 500
    const sanitizedHeaders = headers.map((h, i) =>
      h
        ? String(h)
            // eslint-disable-next-line no-control-regex
            .replace(/[\x00-\x1F\x7F]/g, '')
            .trim()
            .substring(0, 500) || `Column ${i + 1}`
        : `Column ${i + 1}`,
    );

    // Get row count (with row-count cap for zip-bomb mitigation)
    let rowCount = 0;
    const fullResult = Papa.parse(content, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      step: () => {
        rowCount++;
        if (rowCount > MAX_ROW_COUNT) {
          return false; // abort
        }
      },
    });

    if (rowCount > MAX_ROW_COUNT) {
      return {
        ok: false,
        error: {
          code: 'ROW_COUNT_EXCEEDED',
          detail: `File exceeds maximum row limit (${MAX_ROW_COUNT} rows)`,
        },
      };
    }

    return {
      ok: true,
      fileId: '', // Will be set by caller
      sheets: [
        {
          name: 'Sheet1',
          columnHeaders: sanitizedHeaders,
          rowCount: fullResult.data.length,
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

async function handleXlsxStaging(filePath: string): Promise<StageFileResponse> {
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
        };
      }

      // Get first row as headers
      const firstRow = worksheet.getRow(1);
      const columnHeaders: string[] = [];

      firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const value = cell.value;
        let header = '';

        if (value !== null && value !== undefined) {
          // Handle various cell value types
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

        // Sanitize: strip control chars, cap length 500
        header = header
          // eslint-disable-next-line no-control-regex
          .replace(/[\x00-\x1F\x7F]/g, '')
          .trim()
          .substring(0, 500);

        columnHeaders.push(
          header || `Column ${String.fromCharCode(64 + colNumber)}`, // A, B, C, ...
        );
      });

      return {
        name: sheetName,
        columnHeaders,
        rowCount: worksheet.rowCount - 1, // Exclude header row
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

      const { fileId, sheetName, accountId, columnMapping } = parsed.data;

      // Resolve fileId to real path
      const filePath = resolveFileId(fileId);
      if (!filePath) {
        return {
          ok: false,
          error: { code: 'FILE_UNREADABLE', detail: 'Invalid or expired file session' },
        };
      }

      // Load and parse file
      const rows = await loadFileRows(filePath, sheetName, columnMapping);
      if (!rows.ok) {
        return { ok: false, error: rows.error };
      }

      // Detect date format from sample
      const dateSamples = rows.data
        .slice(0, 10)
        .map((r) => r.rawDate)
        .filter(Boolean);
      const dateFormatResult = detectDateFormat(dateSamples);

      // Parse all rows
      const parsedRows = rows.data.map((row) =>
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
          rowIndex: r.rowIndex,
          field: e.field,
          reason: e.reason,
        })),
      );

      return {
        ok: true,
        summary: {
          totalRows: rows.data.length,
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

      const { fileId, sheetName, accountId, columnMapping, importDuplicates } = parsed.data;

      // Resolve fileId to real path
      const filePath = resolveFileId(fileId);
      if (!filePath) {
        return {
          ok: false,
          error: { code: 'FILE_UNREADABLE', detail: 'Invalid or expired file session' },
        };
      }

      // Load and parse (same as dry-run)
      const rows = await loadFileRows(filePath, sheetName, columnMapping);
      if (!rows.ok) {
        return { ok: false, error: rows.error };
      }

      const dateSamples = rows.data
        .slice(0, 10)
        .map((r) => r.rawDate)
        .filter(Boolean);
      const dateFormatResult = detectDateFormat(dateSamples);

      const parsedRows = rows.data.map((row) =>
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
          rowIndex: r.rowIndex,
          field: e.field,
          reason: e.reason,
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
): Promise<LoadRowsResult | LoadRowsError> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return loadCsvRows(filePath, mapping);
  } else if (ext === '.xlsx' || ext === '.xls') {
    return loadXlsxRows(filePath, sheetName ?? 'Sheet1', mapping);
  }

  return {
    ok: false,
    error: { code: 'FILE_UNREADABLE', detail: 'Unsupported file format' },
  };
}

function loadCsvRows(filePath: string, mapping: ColumnMapping): LoadRowsResult | LoadRowsError {
  try {
    const content = fs.readFileSync(filePath, 'utf8');

    // Parser safety: dynamicTyping: false, skipEmptyLines: true
    // Row-count cap with abort
    let rowCount = 0;
    let aborted = false;
    const rows: RawRow[] = [];

    Papa.parse(content, {
      header: true,
      dynamicTyping: false,
      skipEmptyLines: true,
      step: (result) => {
        rowCount++;
        if (rowCount > MAX_ROW_COUNT) {
          aborted = true;
          return;
        }

        const row = result.data as Record<string, unknown>;
        rows.push({
          rowIndex: rowCount,
          rawDate: String(row[mapping.date] ?? ''),
          rawAmount: String(row[mapping.amount] ?? ''),
          rawDescription: String(row[mapping.description] ?? ''),
        });
      },
      complete: () => {},
      error: () => {},
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

    if (worksheet.rowCount < 2) {
      return { ok: true, data: [] };
    }

    // Get header row to find column indices
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
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

    if (dateIdx < 0 || amountIdx < 0 || descriptionIdx < 0) {
      return {
        ok: false,
        error: { code: 'PARSE_ERROR', detail: 'Column mapping not found in sheet headers' },
      };
    }

    const rows: RawRow[] = [];
    let rowIndex = 0;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

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
        rawDate = String(dateCell.value);
      }

      rows.push({
        rowIndex,
        rawDate,
        rawAmount: String(amountCell.value ?? ''),
        rawDescription: String(descriptionCell.value ?? ''),
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
  const errors: Array<{ field: 'date' | 'amount' | 'description'; reason: string }> = [];

  // Parse date
  const dateResult = parseDate(row.rawDate, dateFormat);
  if (!dateResult.success) {
    errors.push({ field: 'date', reason: dateResult.error! });
  }

  // Parse amount
  const amountResult = parseAmount(row.rawAmount);
  if (!amountResult.success) {
    errors.push({ field: 'amount', reason: amountResult.error! });
  }

  // Parse description
  const description = row.rawDescription.trim();
  if (!description) {
    errors.push({ field: 'description', reason: 'Description is required' });
  }

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
    errors: [],
  };
}
