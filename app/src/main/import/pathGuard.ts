// Path validation for import — Windows-aware hardening (WI-17 security).
//
// Rejects:
// - UNC paths (\\server\share)
// - Device paths (\\?\, \\.\)
// - Reserved Windows device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
// - Relative paths
// - Path traversal attempts (..)
// - Symlinks (checked via lstat)

import * as path from 'node:path';
import * as fs from 'node:fs';

export interface PathValidationResult {
  ok: true;
  normalized: string;
}

export interface PathValidationError {
  ok: false;
  reason: string;
}

// Windows reserved device names (case-insensitive)
const RESERVED_NAMES = [
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
];

/**
 * Validate a file path for import operations.
 *
 * Enforces:
 * - No UNC paths (\\server\share or \\?\C:\)
 * - No Windows device paths (\\.\)
 * - No reserved Windows device names
 * - Must be absolute
 * - No path traversal (..)
 * - File must exist and not be a symlink
 *
 * @param filePath - Raw file path from renderer
 * @returns Validation result with normalized path or error reason
 */
export function validateFilePath(filePath: string): PathValidationResult | PathValidationError {
  // 1. Reject UNC paths
  // \\server\share or \\?\C:\ (long-path prefix) or \\.\device (device path)
  if (filePath.startsWith('\\\\')) {
    return { ok: false, reason: 'UNC and device paths are not supported' };
  }

  // 2. Normalize and check absolute + no traversal
  const normalized = path.normalize(filePath);

  if (!path.isAbsolute(normalized)) {
    return { ok: false, reason: 'Path must be absolute' };
  }

  if (normalized.includes('..')) {
    return { ok: false, reason: 'Path traversal detected' };
  }

  // 3. Reject Windows reserved device names
  const basename = path.basename(normalized);
  const basenameUpper = basename.toUpperCase();
  const nameWithoutExt = path.parse(basename).name.toUpperCase();

  for (const reserved of RESERVED_NAMES) {
    if (basenameUpper === reserved || nameWithoutExt === reserved) {
      return { ok: false, reason: 'Reserved device name not allowed' };
    }
  }

  // 4. Check file exists and is not a symlink
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(normalized); // lstat does NOT follow symlinks
  } catch {
    return { ok: false, reason: 'File not found or not accessible' };
  }

  if (stats.isSymbolicLink()) {
    return { ok: false, reason: 'Symbolic links are not supported' };
  }

  if (!stats.isFile()) {
    return { ok: false, reason: 'Path is not a regular file' };
  }

  return { ok: true, normalized };
}
