// SPEC-027 FR14 / R6 — Export destination guard (main process).
//
// Hard-blocks any save destination that resolves INSIDE the encrypted
// workspace/dataset root (no "Save anyway"), and rejects system temp dirs.
// Both the destination and the workspace root are canonicalized (resolve +
// realpath where the path exists) and compared case-insensitively on Windows,
// with a boundary-aware prefix test so a sibling like `workspace-export` is
// NOT mistaken for a child of `workspace`.

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as nodePath from 'node:path';

export type DestGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'EXPORT_DEST_INSIDE_WORKSPACE' | 'EXPORT_DEST_TEMP_DIR' };

/** True on win32 / darwin where the filesystem is case-insensitive by default. */
function isCaseInsensitiveFs(): boolean {
  return process.platform === 'win32' || process.platform === 'darwin';
}

function normalizeForCompare(p: string): string {
  const resolved = nodePath.resolve(p);
  // Strip a trailing separator (except a bare root like `C:\`).
  const trimmed = resolved.replace(/[\\/]+$/u, '') || resolved;
  return isCaseInsensitiveFs() ? trimmed.toLowerCase() : trimmed;
}

/**
 * Canonicalize an existing-or-not path: realpath the deepest existing ancestor
 * (resolving junctions/symlinks), then re-append the non-existent tail.
 */
async function canonicalize(p: string): Promise<string> {
  const resolved = nodePath.resolve(p);
  let existing = resolved;
  const tail: string[] = [];
  // Walk up until we find a path that exists.
  for (;;) {
    try {
      const real = await fs.realpath(existing);
      return tail.length === 0 ? real : nodePath.join(real, ...tail);
    } catch {
      const parent = nodePath.dirname(existing);
      if (parent === existing) {
        // Reached the root without an existing ancestor.
        return resolved;
      }
      tail.unshift(nodePath.basename(existing));
      existing = parent;
    }
  }
}

/** Boundary-aware "is `child` inside (or equal to) `parent`". */
function isInside(child: string, parent: string): boolean {
  const c = normalizeForCompare(child);
  const p = normalizeForCompare(parent);
  if (c === p) return true;
  return c.startsWith(p + nodePath.sep);
}

export interface DestGuardDeps {
  /** Override the temp dir (tests). Defaults to `os.tmpdir()`. */
  readonly tmpDir?: string;
}

/**
 * Validate a chosen destination FILE path against the active workspace root.
 * Returns a structured result; callers map the code to the renderer.
 */
export async function assertDestinationAllowed(
  destPath: string,
  workspaceRoot: string,
  deps: DestGuardDeps = {},
): Promise<DestGuardResult> {
  const canonicalDest = await canonicalize(destPath);
  const canonicalRoot = await canonicalize(workspaceRoot);

  if (isInside(canonicalDest, canonicalRoot)) {
    return { ok: false, code: 'EXPORT_DEST_INSIDE_WORKSPACE' };
  }

  const tmp = deps.tmpDir ?? os.tmpdir();
  const canonicalTmp = await canonicalize(tmp);
  if (isInside(canonicalDest, canonicalTmp)) {
    return { ok: false, code: 'EXPORT_DEST_TEMP_DIR' };
  }

  return { ok: true };
}

// Exposed for unit tests.
export const _internal = { isInside, normalizeForCompare, canonicalize };
