// dataset:export IPC handler — copy the active dataset to a chosen folder.
//
// Non-destructive backup flow: copies events.ndjson + metadata files to a
// target folder, verifies the copy, and writes an export-manifest.json for
// provenance tracking. The active dataset remains unchanged.
//
// Used by Preferences → Dataset → Export… button (issue #180).

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { app } from 'electron';
import {
  datasetExportRequestSchema,
  type DatasetExportResponse,
} from '../../../shared/ipc-contracts/dataset.js';
import { getEffectiveEventLogDir, getDatasetId } from '../../bootstrap.js';

/**
 * Dataset export handler. Validates the target directory, copies canonical
 * dataset files, verifies the copy, and writes a manifest.
 */
export async function handleDatasetExport(raw: unknown): Promise<DatasetExportResponse> {
  // 1. Validate request shape
  const parsed = datasetExportRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'EXPORT_FAILED',
        message: 'Invalid request: ' + parsed.error.issues.map((i) => i.message).join('; '),
      },
    };
  }

  const { targetDir } = parsed.data;
  const targetPath = path.resolve(targetDir);
  const userDataDir = app.getPath('userData');
  const sourceDir = getEffectiveEventLogDir();

  // 2. Validate target: must NOT be under userData, must NOT equal source
  if (isUnderDir(targetPath, path.resolve(userDataDir))) {
    return {
      ok: false,
      error: {
        code: 'EXPORT_TARGET_INVALID',
        message: `Export target must not be under userData (${userDataDir}). Choose an external folder.`,
      },
    };
  }

  if (pathsEqual(targetPath, path.resolve(sourceDir))) {
    return {
      ok: false,
      error: {
        code: 'EXPORT_TARGET_INVALID',
        message: 'Export target must be different from the current dataset folder.',
      },
    };
  }

  if (isUnderDir(targetPath, path.resolve(sourceDir))) {
    return {
      ok: false,
      error: {
        code: 'EXPORT_TARGET_INVALID',
        message: 'Export target must not be inside the current dataset folder.',
      },
    };
  }

  if (isUnderDir(path.resolve(sourceDir), targetPath)) {
    return {
      ok: false,
      error: {
        code: 'EXPORT_TARGET_INVALID',
        message: 'Export target must not contain the current dataset folder.',
      },
    };
  }

  // 3. Ensure target directory exists and is writable
  try {
    await fs.mkdir(targetPath, { recursive: true });
  } catch (err) {
    const errCode = (err as NodeJS.ErrnoException).code;
    if (errCode === 'EACCES' || errCode === 'EPERM') {
      return {
        ok: false,
        error: {
          code: 'EXPORT_PERMISSION_DENIED',
          message: `Permission denied creating export folder: ${errMessage(err)}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'EXPORT_FAILED',
        message: `Cannot create export folder: ${errMessage(err)}`,
      },
    };
  }

  // 4. Check that target is empty of events.ndjson (refuse to overwrite)
  const targetEventsPath = path.join(targetPath, 'events.ndjson');
  try {
    await fs.access(targetEventsPath);
    // File exists — refuse
    return {
      ok: false,
      error: {
        code: 'EXPORT_TARGET_NOT_EMPTY',
        message:
          'That folder already contains a dataset (events.ndjson exists). Please choose an empty folder.',
      },
    };
  } catch (err) {
    // ENOENT is expected (file doesn't exist) — proceed
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Some other access error
      const errCode = (err as NodeJS.ErrnoException).code;
      if (errCode === 'EACCES' || errCode === 'EPERM') {
        return {
          ok: false,
          error: {
            code: 'EXPORT_PERMISSION_DENIED',
            message: `Permission denied accessing export folder: ${errMessage(err)}`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'EXPORT_FAILED',
          message: `Cannot access export folder: ${errMessage(err)}`,
        },
      };
    }
  }

  // 5. Identify files to copy: events.ndjson (required), dataset.json (if present)
  const filesToCopy = ['events.ndjson'];
  const datasetJsonPath = path.join(sourceDir, 'dataset.json');
  try {
    await fs.access(datasetJsonPath);
    filesToCopy.push('dataset.json');
  } catch {
    // dataset.json doesn't exist or not readable — skip it
  }

  // 6. Copy files
  let totalBytes = 0;
  const copiedFiles: string[] = [];

  for (const fileName of filesToCopy) {
    const srcPath = path.join(sourceDir, fileName);
    const destPath = path.join(targetPath, fileName);

    try {
      await fs.copyFile(srcPath, destPath);
      const stats = await fs.stat(destPath);
      totalBytes += stats.size;
      copiedFiles.push(fileName);
    } catch (err) {
      // Cleanup partial files on failure
      for (const copied of copiedFiles) {
        await fs.rm(path.join(targetPath, copied), { force: true }).catch(() => undefined);
      }

      const errCode = (err as NodeJS.ErrnoException).code;
      if (errCode === 'ENOSPC') {
        return {
          ok: false,
          error: {
            code: 'EXPORT_DISK_FULL',
            message: 'Not enough disk space at the destination.',
          },
        };
      }
      if (errCode === 'EACCES' || errCode === 'EPERM') {
        return {
          ok: false,
          error: {
            code: 'EXPORT_PERMISSION_DENIED',
            message: `Permission denied copying ${fileName}: ${errMessage(err)}`,
          },
        };
      }
      return {
        ok: false,
        error: {
          code: 'EXPORT_FAILED',
          message: `Failed to copy ${fileName}: ${errMessage(err)}`,
          details: errMessage(err),
        },
      };
    }
  }

  // 7. Verify: size match for events.ndjson + last line equality
  const srcEventsPath = path.join(sourceDir, 'events.ndjson');
  const destEventsPath = path.join(targetPath, 'events.ndjson');

  try {
    const srcStats = await fs.stat(srcEventsPath);
    const destStats = await fs.stat(destEventsPath);

    if (srcStats.size !== destStats.size) {
      // Cleanup on verification failure
      for (const copied of copiedFiles) {
        await fs.rm(path.join(targetPath, copied), { force: true }).catch(() => undefined);
      }
      return {
        ok: false,
        error: {
          code: 'EXPORT_VERIFY_FAILED',
          message: 'Export completed but verification failed (size mismatch). Please try again.',
        },
      };
    }

    // Check last line equality (only if file is non-empty)
    if (srcStats.size > 0) {
      const srcContent = await fs.readFile(srcEventsPath, 'utf-8');
      const destContent = await fs.readFile(destEventsPath, 'utf-8');

      const srcLastLine = srcContent.trimEnd().split('\n').pop() ?? '';
      const destLastLine = destContent.trimEnd().split('\n').pop() ?? '';

      if (srcLastLine !== destLastLine) {
        // Cleanup on verification failure
        for (const copied of copiedFiles) {
          await fs.rm(path.join(targetPath, copied), { force: true }).catch(() => undefined);
        }
        return {
          ok: false,
          error: {
            code: 'EXPORT_VERIFY_FAILED',
            message:
              'Export completed but verification failed (last line mismatch). Please try again.',
          },
        };
      }
    }
  } catch (err) {
    // Cleanup on verification failure
    for (const copied of copiedFiles) {
      await fs.rm(path.join(targetPath, copied), { force: true }).catch(() => undefined);
    }
    return {
      ok: false,
      error: {
        code: 'EXPORT_VERIFY_FAILED',
        message: `Export verification failed: ${errMessage(err)}`,
        details: errMessage(err),
      },
    };
  }

  // 8. Write export-manifest.json
  const datasetId = getDatasetId();
  const eventCount = await countLines(srcEventsPath);
  const appVersion = app.getVersion();

  const manifest = {
    exportedAt: new Date().toISOString(),
    datasetId,
    sourceEventCount: eventCount,
    appVersion,
  };

  const manifestPath = path.join(targetPath, 'export-manifest.json');
  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (err) {
    // Non-fatal — manifest is nice-to-have, not critical
    console.warn('[dataset:export] Failed to write export-manifest.json:', err);
  }

  // 9. Success
  return {
    ok: true,
    targetDir: targetPath,
    fileCount: copiedFiles.length,
    totalBytes,
  };
}

// --- helpers ------------------------------------------------------------

function isUnderDir(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === '') return true; // identical
  if (rel.startsWith('..')) return false;
  if (path.isAbsolute(rel)) return false; // different drive on Windows
  return true;
}

function pathsEqual(a: string, b: string): boolean {
  const na = path.normalize(a);
  const nb = path.normalize(b);
  if (process.platform === 'win32') {
    return na.toLowerCase() === nb.toLowerCase();
  }
  return na === nb;
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function countLines(filePath: string): Promise<number> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content
      .trimEnd()
      .split('\n')
      .filter((line) => line.trim().length > 0).length;
  } catch {
    return 0;
  }
}
