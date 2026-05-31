// SPEC-027 FR14 — Export destination guard unit tests (Cypher).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertDestinationAllowed, _internal } from './exportDestGuard.js';

let root: string;
let workspace: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'export-guard-'));
  workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('assertDestinationAllowed', () => {
  it('blocks a destination inside the workspace root', async () => {
    const dest = path.join(workspace, 'movimientos.csv');
    const result = await assertDestinationAllowed(dest, workspace, {
      tmpDir: path.join(root, 'tmp'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EXPORT_DEST_INSIDE_WORKSPACE');
  });

  it('blocks a deeply nested destination inside the workspace', async () => {
    const dest = path.join(workspace, 'a', 'b', 'movimientos.csv');
    const result = await assertDestinationAllowed(dest, workspace, {
      tmpDir: path.join(root, 'tmp'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EXPORT_DEST_INSIDE_WORKSPACE');
  });

  it('allows a sibling directory that shares a name prefix', async () => {
    // `workspace-export` must NOT be treated as a child of `workspace`.
    const sibling = path.join(root, 'workspace-export');
    await fs.mkdir(sibling, { recursive: true });
    const dest = path.join(sibling, 'movimientos.csv');
    const result = await assertDestinationAllowed(dest, workspace, {
      tmpDir: path.join(root, 'tmp'),
    });
    expect(result.ok).toBe(true);
  });

  it('blocks a destination inside the temp dir', async () => {
    const tmp = path.join(root, 'tmp');
    await fs.mkdir(tmp, { recursive: true });
    const dest = path.join(tmp, 'movimientos.csv');
    const result = await assertDestinationAllowed(dest, workspace, { tmpDir: tmp });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('EXPORT_DEST_TEMP_DIR');
  });

  it('allows an ordinary destination outside both roots', async () => {
    const documents = path.join(root, 'Documents');
    await fs.mkdir(documents, { recursive: true });
    const dest = path.join(documents, 'movimientos.csv');
    const result = await assertDestinationAllowed(dest, workspace, {
      tmpDir: path.join(root, 'tmp'),
    });
    expect(result.ok).toBe(true);
  });

  it('blocks the workspace root itself (equality boundary)', async () => {
    const result = await assertDestinationAllowed(workspace, workspace, {
      tmpDir: path.join(root, 'tmp'),
    });
    expect(result.ok).toBe(false);
  });
});

describe('_internal.isInside', () => {
  it('treats equal paths as inside', () => {
    expect(_internal.isInside('/a/b', '/a/b')).toBe(true);
  });

  it('is boundary-aware (prefix is not enough)', () => {
    expect(_internal.isInside('/a/bc', '/a/b')).toBe(false);
    expect(_internal.isInside('/a/b/c', '/a/b')).toBe(true);
  });

  it('ignores a trailing separator', () => {
    const a = _internal.normalizeForCompare('/a/b/');
    const b = _internal.normalizeForCompare('/a/b');
    expect(a).toBe(b);
  });
});
