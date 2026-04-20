// Session file registry for import — opaque file-ID tokens (WI-17 security).
//
// Maintains an in-memory allowlist of staged files with opaque UUID-based IDs.
// Prevents renderer from reading arbitrary files by manipulating filePath.
//
// Flow:
// 1. stage-file: validates path → generates fileId (UUIDv4) → stores mapping
// 2. dry-run/commit: resolves fileId → real path from registry
// 3. After commit or TTL (30 min): evict entry

import { randomUUID } from 'node:crypto';

interface StagedFile {
  path: string;
  stagedAt: number; // timestamp in ms
}

const stagedFiles = new Map<string, StagedFile>();

// TTL for staged files: 30 minutes
const STAGE_TTL_MS = 30 * 60 * 1000;

/**
 * Stage a file path and return an opaque file ID.
 *
 * @param filePath - Validated file path (already normalized)
 * @returns Opaque file ID (UUIDv4)
 */
export function stageFile(filePath: string): string {
  const fileId = randomUUID();
  stagedFiles.set(fileId, {
    path: filePath,
    stagedAt: Date.now(),
  });
  return fileId;
}

/**
 * Resolve a file ID to its real path.
 *
 * @param fileId - Opaque file ID from renderer
 * @returns File path or null if ID is invalid or expired
 */
export function resolveFileId(fileId: string): string | null {
  const entry = stagedFiles.get(fileId);
  if (!entry) {
    return null;
  }

  // Check TTL
  const age = Date.now() - entry.stagedAt;
  if (age > STAGE_TTL_MS) {
    stagedFiles.delete(fileId);
    return null;
  }

  return entry.path;
}

/**
 * Evict a file ID from the registry (after commit or cancel).
 *
 * @param fileId - Opaque file ID to evict
 */
export function evictFileId(fileId: string): void {
  stagedFiles.delete(fileId);
}

/**
 * Evict all expired file IDs (TTL cleanup).
 * Should be called periodically (e.g., every 5 minutes).
 */
export function evictExpired(): void {
  const now = Date.now();
  for (const [fileId, entry] of stagedFiles.entries()) {
    const age = now - entry.stagedAt;
    if (age > STAGE_TTL_MS) {
      stagedFiles.delete(fileId);
    }
  }
}

/**
 * Clear all staged files (for testing or session reset).
 */
export function clearAll(): void {
  stagedFiles.clear();
}
