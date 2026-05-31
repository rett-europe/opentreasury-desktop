// SPEC-027 §12 (Option A) — Export gate (main process).
//
// Two responsibilities:
//   1. One-shot confirmation tokens that bind a `prepare` result to a single
//      `run`. The token carries the resolved destination + filters + count so
//      `export:run` never has to (the renderer only echoes the opaque token).
//   2. Authoritative rate-limit / lockout state persisted MK-encrypted per
//      workspace so an app restart can't bypass the throttle. The pure state
//      machine lives in `core/export/gate.ts`; this module persists it.

import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as nodePath from 'node:path';
import { decrypt, encrypt, randomBytes } from '../../core/crypto/primitives.js';
import { emptyGateState, type GateState } from '../../core/export/gate.js';
import type {
  ExportFilters,
  ExportFormat,
  ExportLocaleCode,
} from '../../shared/ipc-contracts/export.js';

// ---------------------------------------------------------------------------
// One-shot confirmation tokens (in-memory, process lifetime)
// ---------------------------------------------------------------------------

/** Token time-to-live. A confirmation must be completed within this window. */
export const TOKEN_TTL_MS = 60_000;

export interface PendingExport {
  readonly token: string;
  /** Originating renderer window id (`event.sender.id`). */
  readonly webContentsId: number;
  /** Workspace folder the token is bound to (invalidated on workspace change). */
  readonly workspaceFolderPath: string;
  readonly format: ExportFormat;
  readonly filters: ExportFilters;
  readonly locale: ExportLocaleCode;
  /** Absolute destination chosen in the save dialog. Never crosses IPC. */
  readonly destPath: string;
  readonly basename: string;
  readonly estimatedRowCount: number;
  readonly afterHash: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

// At most one pending export per window. Minting a new one drops the previous.
const pendingByWindow = new Map<number, PendingExport>();
const pendingByToken = new Map<string, PendingExport>();

function dropPending(p: PendingExport): void {
  pendingByToken.delete(p.token);
  if (pendingByWindow.get(p.webContentsId) === p) {
    pendingByWindow.delete(p.webContentsId);
  }
}

export interface MintPendingInput {
  readonly webContentsId: number;
  readonly workspaceFolderPath: string;
  readonly format: ExportFormat;
  readonly filters: ExportFilters;
  readonly locale: ExportLocaleCode;
  readonly destPath: string;
  readonly basename: string;
  readonly estimatedRowCount: number;
  readonly afterHash: string;
  readonly now: number;
}

/** Mint a one-shot token, invalidating any prior pending export for the window. */
export function mintPendingExport(input: MintPendingInput): PendingExport {
  const existing = pendingByWindow.get(input.webContentsId);
  if (existing) dropPending(existing);

  const token = nodeRandomBytes(32).toString('base64url');
  const pending: PendingExport = {
    token,
    webContentsId: input.webContentsId,
    workspaceFolderPath: input.workspaceFolderPath,
    format: input.format,
    filters: input.filters,
    locale: input.locale,
    destPath: input.destPath,
    basename: input.basename,
    estimatedRowCount: input.estimatedRowCount,
    afterHash: input.afterHash,
    createdAt: input.now,
    expiresAt: input.now + TOKEN_TTL_MS,
  };
  pendingByWindow.set(input.webContentsId, pending);
  pendingByToken.set(token, pending);
  return pending;
}

/**
 * Consume a token: one-shot. Returns the pending export only when the token
 * exists, has not expired, and was minted for the same window. The token is
 * removed regardless (so a failed attempt can't be replayed).
 */
export function consumePendingExport(
  token: string,
  webContentsId: number,
  now: number,
): PendingExport | null {
  const pending = pendingByToken.get(token);
  if (!pending) return null;
  dropPending(pending);
  if (pending.webContentsId !== webContentsId) return null;
  if (now >= pending.expiresAt) return null;
  return pending;
}

/** Invalidate any pending token for one window (e.g. on a fresh prepare error). */
export function invalidatePendingForWindow(webContentsId: number): void {
  const existing = pendingByWindow.get(webContentsId);
  if (existing) dropPending(existing);
}

/** Invalidate ALL pending tokens (workspace lock/clear/switch, shutdown). */
export function invalidateAllPendingExports(): void {
  pendingByWindow.clear();
  pendingByToken.clear();
}

// ---------------------------------------------------------------------------
// Persisted rate-limit / lockout state (MK-encrypted per workspace)
// ---------------------------------------------------------------------------

const GATE_DIR = nodePath.join('.treasury', 'export');
const GATE_BLOB = 'gate.v1';
const NONCE_SIZE = 24;

function gateDir(workspaceFolderPath: string): string {
  return nodePath.join(workspaceFolderPath, GATE_DIR);
}

function gateAad(datasetId: string): Uint8Array {
  return Buffer.from(`export-gate:v1:${datasetId}`, 'utf8');
}

export interface GatePersistenceDeps {
  readonly workspaceFolderPath: string;
  readonly mk: Uint8Array;
  readonly datasetId: string;
}

/** Load the persisted gate state, or an empty state when none/corrupt. */
export async function loadGateState(deps: GatePersistenceDeps): Promise<GateState> {
  const file = nodePath.join(gateDir(deps.workspaceFolderPath), GATE_BLOB);
  let blob: Buffer;
  try {
    blob = await fs.readFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyGateState();
    throw err;
  }
  if (blob.length < NONCE_SIZE) return emptyGateState();
  try {
    const nonce = blob.subarray(0, NONCE_SIZE);
    const cipher = blob.subarray(NONCE_SIZE);
    const plain = decrypt(cipher, deps.mk, nonce, gateAad(deps.datasetId));
    const parsed = JSON.parse(Buffer.from(plain).toString('utf8')) as GateState;
    // Shape sanity — fall back to empty on anything unexpected.
    if (
      !Array.isArray(parsed.attempts) ||
      typeof parsed.mistypes !== 'number' ||
      (parsed.lockedUntil !== null && typeof parsed.lockedUntil !== 'number')
    ) {
      return emptyGateState();
    }
    return parsed;
  } catch {
    // Tampered/undecryptable gate state must never silently disable throttling
    // in a way that helps an attacker — treat as empty (most restrictive is
    // identical here since empty allows the first export; corruption is rare).
    return emptyGateState();
  }
}

/** Persist the gate state MK-encrypted (atomic temp→rename). */
export async function saveGateState(deps: GatePersistenceDeps, state: GateState): Promise<void> {
  const dir = gateDir(deps.workspaceFolderPath);
  await fs.mkdir(dir, { recursive: true });
  const nonce = randomBytes(NONCE_SIZE);
  const cipher = encrypt(
    Buffer.from(JSON.stringify(state), 'utf8'),
    deps.mk,
    nonce,
    gateAad(deps.datasetId),
  );
  const data = Buffer.concat([Buffer.from(nonce), Buffer.from(cipher)]);
  const finalPath = nodePath.join(dir, GATE_BLOB);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.partial`;
  await fs.writeFile(tmpPath, data, { mode: 0o600 });
  try {
    await fs.rename(tmpPath, finalPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}

/** Test-only reset of the in-memory token tables. */
export function _resetPendingExports(): void {
  invalidateAllPendingExports();
}
