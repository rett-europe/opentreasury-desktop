// SPEC-031 phase 1 — end-to-end: MCP SDK client → stdio launcher → named
// pipe / socket → in-app MCP server → read model.
/* eslint-disable import/no-unresolved -- SDK subpath exports */
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'node:child_process';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-mcp-'));
const socketPath =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\ot-mcp-test-${process.pid}-${Date.now()}`
    : path.join(tmp, 'mcp.sock');
process.env.OPENTREASURY_MCP_SOCKET = socketPath;

vi.mock('electron', () => ({
  app: { getPath: () => tmp, getAppPath: () => tmp },
}));

const readModel = {
  transactions: [
    {
      id: 'tx-1',
      date: '2026-09-01',
      type: 'income',
      amount: 12.5,
      currency: 'EUR',
      description: 'Coffee',
      accountId: 'acc1',
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      status: 'pending',
      createdAt: '2026-09-01T00:00:00Z',
      reference: null,
      details: null,
    },
  ],
  configCategories: [],
  configTags: [],
  configAccounts: [],
  importMappings: [],
  rowHashes: new Set<string>(),
  notes: new Map(),
  transactionsByReference: new Map(),
  splits: new Map(),
  splitParentIds: new Set<string>(),
};
const appended: unknown[] = [];

vi.mock('../bootstrap.js', () => ({
  getHydratedReadModel: () => readModel,
  getEventLog: () => ({
    append: async (event: unknown) => void appended.push(event),
    appendBatch: async (events: readonly unknown[]) => void appended.push(...events),
    load: async () => appended as never[],
  }),
  getDatasetId: () => '01DATASET0000000000000000',
  getDeviceId: () => '01DEVICE0000000000000000',
  getProfile: () => ({ userId: '01USER000000000000000000', identitySource: 'local' }),
  isEncryptedWorkspacePending: () => false,
  isOnboardingPending: () => false,
}));

const { setMcpEnabled, setMcpOptions, stopMcpServer, getMcpStatus } = await import('./server.js');

const launcher = path.join(tmp, 'launcher.cjs');

function transport(token: string): StdioClientTransport {
  return new StdioClientTransport({
    command: process.execPath,
    args: [launcher],
    env: {
      ...(process.env as Record<string, string>),
      OPENTREASURY_MCP_TOKEN: token,
      OPENTREASURY_MCP_SOCKET: socketPath,
    },
    stderr: 'pipe',
  });
}

describe('MCP server end-to-end', () => {
  let token = '';

  beforeAll(async () => {
    await build({
      entryPoints: [path.resolve(__dirname, '../../mcp-launcher/index.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      outfile: launcher,
      logLevel: 'silent',
    });
    const status = await setMcpEnabled(true);
    expect(status.running).toBe(true);
    token = status.token ?? '';
  });

  afterAll(async () => {
    await stopMcpServer();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('lists tools and returns transactions through the launcher', async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(transport(token));
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['list_transactions', 'get_transaction', 'list_categories']),
    );
    const res = await client.callTool({ name: 'list_transactions', arguments: { limit: 10 } });
    const text = (res.content as Array<{ text: string }>)[0]!.text;
    expect(text).toContain('tx-1');
    await client.close();
  });

  it('advertises and runs write tools only when write options are enabled', async () => {
    const client = new Client({ name: 'write-test', version: '1.0.0' });
    await client.connect(transport(token));
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      'update_transactions',
    );
    await setMcpOptions({ allowWrites: true });
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('update_transactions');
    const res = await client.callTool({
      name: 'update_transactions',
      arguments: { items: [{ id: 'tx-1', type: 'expense' }] },
    });
    const payload = JSON.parse((res.content as Array<{ text: string }>)[0]!.text);
    expect(payload.updatedCount).toBe(1);
    expect(appended[0]).toMatchObject({
      type: 'tx.updated',
      actorIdentitySource: 'mcp',
      payload: { id: 'tx-1', type: 'expense', status: 'pending' },
    });
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain(
      'delete_transactions',
    );
    await setMcpOptions({ allowDelete: true });
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('delete_transactions');
    await client.close();
  });

  it('rejects an invalid token', async () => {
    const child = spawn(process.execPath, [launcher], {
      env: { ...process.env, OPENTREASURY_MCP_TOKEN: '0'.repeat(64) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    expect(code).toBe(3);
    expect(stderr).toMatch(/rejected/);
  });

  it('stops listening when disabled', async () => {
    const status = await setMcpEnabled(false);
    expect(status.running).toBe(false);
    expect((await getMcpStatus()).enabled).toBe(false);
  });
});
