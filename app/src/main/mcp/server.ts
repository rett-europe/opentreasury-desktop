/* eslint-disable import/no-unresolved */
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { app } from 'electron';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type JSONRPCMessage,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { ReadModel } from '../../core/query/types.js';
import {
  getHydratedReadModel,
  getEventLog,
  getDatasetId,
  getDeviceId,
  getProfile,
  isEncryptedWorkspacePending,
  isOnboardingPending,
} from '../bootstrap.js';
import { newUlid } from '../ids.js';
import { ensureMcpToken, loadMcpSettings, saveMcpSettings, createMcpToken } from './settings.js';
import {
  appLockedError,
  getTransaction,
  listAccounts,
  listCategories,
  listTags,
  listTransactions,
  classifyTransactions,
  setTransactionType,
  updateTransactions,
  deleteTransactions,
  createTransactions,
} from './tools.js';

class LineTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  constructor(
    private readonly socket: Socket,
    private buffer = '',
  ) {}
  async start(): Promise<void> {
    const drain = () => {
      for (;;) {
        const i = this.buffer.indexOf('\n');
        if (i < 0) break;
        const line = this.buffer.slice(0, i).trim();
        this.buffer = this.buffer.slice(i + 1);
        if (!line) continue;
        try {
          this.onmessage?.(JSON.parse(line) as JSONRPCMessage);
        } catch (e) {
          this.onerror?.(e as Error);
        }
      }
    };
    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8');
      drain();
    });
    // Lines that arrived in the same chunk as the auth handshake.
    queueMicrotask(drain);
    this.socket.on('error', (e) => this.onerror?.(e));
    this.socket.on('close', () => this.onclose?.());
  }
  async send(message: JSONRPCMessage): Promise<void> {
    this.socket.write(`${JSON.stringify(message)}\n`);
  }
  async close(): Promise<void> {
    this.socket.end();
    this.onclose?.();
  }
}

export interface McpStatus {
  enabled: boolean;
  allowWrites: boolean;
  allowDelete: boolean;
  running: boolean;
  token: string | null;
  launcherPath: string;
  configSnippet: string;
}
let server: NetServer | null = null;
let sockets = new Set<Socket>();
function userData(): string {
  return app.getPath('userData');
}
export function getMcpSocketPath(): string {
  return (
    process.env.OPENTREASURY_MCP_SOCKET ??
    (process.platform === 'win32'
      ? `\\\\.\\pipe\\opentreasury-mcp-${os.userInfo().username.replace(/[^A-Za-z0-9_.-]/g, '_')}`
      : path.join(os.homedir(), '.opentreasury-mcp.sock'))
  );
}
export function getLauncherPath(): string {
  // app.getAppPath() is the repo root in dev and resources/app.asar when packaged;
  // ELECTRON_RUN_AS_NODE can execute scripts from inside the asar.
  return path.join(app.getAppPath(), 'dist', 'mcp-launcher', 'index.cjs');
}
function snippet(token: string | null): string {
  return JSON.stringify(
    {
      command: process.execPath,
      args: [getLauncherPath()],
      env: { ELECTRON_RUN_AS_NODE: '1', OPENTREASURY_MCP_TOKEN: token ?? '<token>' },
    },
    null,
    2,
  );
}
function isUnlocked(): boolean {
  try {
    getHydratedReadModel();
    return !isEncryptedWorkspacePending() && !isOnboardingPending();
  } catch {
    return false;
  }
}
function currentModel(): ReadModel | null {
  try {
    return isUnlocked() ? getHydratedReadModel() : null;
  } catch {
    return null;
  }
}
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
function toolSchema(properties: Record<string, unknown> = {}, required: string[] = []) {
  return { type: 'object', properties, required, additionalProperties: false };
}
async function toolDefinitions() {
  const settings = await loadMcpSettings(userData());
  const writeTools = settings.allowWrites
    ? [
        {
          name: 'create_transactions',
          description:
            'Create new transactions in an existing account (EUR). Created transactions are always pending.',
          inputSchema: toolSchema(
            {
              items: {
                type: 'array',
                minItems: 1,
                maxItems: 200,
                items: toolSchema(
                  {
                    accountId: { type: 'string' },
                    date: { type: 'string', description: 'YYYY-MM-DD' },
                    type: { type: 'string', enum: ['income', 'expense'] },
                    amount: { type: 'number', exclusiveMinimum: 0 },
                    description: { type: 'string', maxLength: 500 },
                    details: { type: ['string', 'null'], maxLength: 1000 },
                    reference: { type: ['string', 'null'], maxLength: 120 },
                    categoryId: { type: ['string', 'null'] },
                    subcategoryId: { type: ['string', 'null'] },
                    tagIds: { type: 'array', items: { type: 'string' } },
                  },
                  ['accountId', 'date', 'type', 'amount', 'description'],
                ),
              },
            },
            ['items'],
          ),
        },
        {
          name: 'classify_transactions',
          description:
            'Classify pending transactions using existing categories/tags. Touched transactions stay pending.',
          inputSchema: toolSchema(
            {
              items: {
                type: 'array',
                maxItems: 500,
                items: toolSchema(
                  {
                    id: { type: 'string' },
                    categoryId: { type: ['string', 'null'] },
                    subcategoryId: { type: ['string', 'null'] },
                    tagIds: { type: 'array', items: { type: 'string' } },
                  },
                  ['id'],
                ),
              },
            },
            ['items'],
          ),
        },
        {
          name: 'set_transaction_type',
          description:
            'Set pending transactions to income or expense. Touched transactions stay pending.',
          inputSchema: toolSchema(
            {
              ids: { type: 'array', maxItems: 500, items: { type: 'string' } },
              type: { type: 'string', enum: ['income', 'expense'] },
            },
            ['ids', 'type'],
          ),
        },
        {
          name: 'update_transactions',
          description:
            'Patch pending transactions. Supports amount/type/date/description/category/subcategory/tags; touched transactions stay pending.',
          inputSchema: toolSchema(
            {
              items: {
                type: 'array',
                maxItems: 500,
                items: toolSchema(
                  {
                    id: { type: 'string' },
                    amount: { type: 'number', exclusiveMinimum: 0 },
                    type: { type: 'string', enum: ['income', 'expense'] },
                    date: { type: 'string' },
                    description: { type: 'string', maxLength: 500 },
                    details: {
                      type: ['string', 'null'],
                      maxLength: 1000,
                      description: 'Free-text details/notes field; null clears it.',
                    },
                    reference: { type: ['string', 'null'], maxLength: 120 },
                    categoryId: { type: ['string', 'null'] },
                    subcategoryId: { type: ['string', 'null'] },
                    tagIds: { type: 'array', items: { type: 'string' } },
                  },
                  ['id'],
                ),
              },
            },
            ['items'],
          ),
        },
      ]
    : [];
  if (settings.allowWrites && settings.allowDelete) {
    writeTools.push({
      name: 'delete_transactions',
      description: 'Delete pending transactions. Approved transactions are never deleted.',
      inputSchema: toolSchema(
        { ids: { type: 'array', maxItems: 200, items: { type: 'string' } } },
        ['ids'],
      ),
    });
  }
  return [
    {
      name: 'list_transactions',
      description: 'List treasury transactions.',
      inputSchema: toolSchema({
        from: { type: 'string' },
        to: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'approved'] },
        uncategorized: { type: 'boolean' },
        accountId: { type: 'string' },
        text: { type: 'string' },
        limit: { type: 'number', default: 100, maximum: 500 },
        cursor: { type: 'string' },
      }),
    },
    {
      name: 'get_transaction',
      description: 'Get one transaction by id.',
      inputSchema: toolSchema({ id: { type: 'string' } }, ['id']),
    },
    {
      name: 'list_categories',
      description: 'List categories and subcategories.',
      inputSchema: toolSchema(),
    },
    { name: 'list_tags', description: 'List tags.', inputSchema: toolSchema() },
    { name: 'list_accounts', description: 'List accounts.', inputSchema: toolSchema() },
    ...writeTools,
  ];
}
function createSdkServer(): Server {
  const s = new Server({ name: 'opentreasury', version: '0.1.0' }, { capabilities: { tools: {} } });
  s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: await toolDefinitions() }));
  s.setRequestHandler(CallToolRequestSchema, (async (req: CallToolRequest) => {
    const model = currentModel();
    if (!model) return appLockedError();
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    let result;
    try {
      if (name === 'list_transactions') result = listTransactions(model, args);
      else if (name === 'get_transaction') result = getTransaction(model, args);
      else if (name === 'list_categories') result = listCategories(model);
      else if (name === 'list_tags') result = listTags(model);
      else if (name === 'list_accounts') result = listAccounts(model);
      else if (
        [
          'create_transactions',
          'classify_transactions',
          'set_transaction_type',
          'update_transactions',
          'delete_transactions',
        ].includes(name)
      ) {
        const settings = await loadMcpSettings(userData());
        if (!settings.allowWrites || (name === 'delete_transactions' && !settings.allowDelete)) {
          result = {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ code: 'FORBIDDEN', message: 'MCP write tool is disabled.' }),
              },
            ],
            isError: true,
          };
        } else {
          const profile = getProfile();
          const deps = {
            eventLog: getEventLog(),
            readModel: model,
            now: () => new Date(),
            newId: newUlid,
            datasetId: getDatasetId(),
            actorDeviceId: getDeviceId(),
            actorUserId: profile?.userId ?? 'PROFILE_PENDING000000000',
            dekVersion: 0,
          };
          if (name === 'create_transactions') result = await createTransactions(deps, args);
          else if (name === 'classify_transactions')
            result = await classifyTransactions(deps, args);
          else if (name === 'set_transaction_type') result = await setTransactionType(deps, args);
          else if (name === 'update_transactions') result = await updateTransactions(deps, args);
          else result = await deleteTransactions(deps, args);
        }
      } else
        result = {
          content: [{ type: 'text' as const, text: JSON.stringify({ code: 'NOT_FOUND' }) }],
          isError: true,
        };
    } catch (err) {
      result = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              code: 'SCHEMA_INVALID',
              message: err instanceof Error ? err.message : String(err),
            }),
          },
        ],
        isError: true,
      };
    }
    console.log(`[mcp] tool ${name} count ${result.content.length}`);
    return result;
  }) as never);
  return s;
}
async function accept(socket: Socket, token: string): Promise<void> {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
  // Clients may disconnect at any moment; an unhandled socket error would
  // crash the main process.
  socket.on('error', (e) => console.warn('[mcp] client socket error', e.message));
  let buf = '';
  const onData = async (chunk: Buffer) => {
    buf += chunk.toString('utf8');
    const i = buf.indexOf('\n');
    if (i < 0) return;
    socket.off('data', onData);
    // Removing the listener doesn't pause a flowing socket; pause so no MCP
    // bytes are dropped while the SDK server connects.
    socket.pause();
    const line = buf.slice(0, i).trim();
    const rest = buf.slice(i + 1);
    try {
      const auth = JSON.parse(line) as { token?: string };
      if (!auth.token || !safeEqual(auth.token, token)) {
        socket.end(JSON.stringify({ error: 'AUTH_FAILED' }) + '\n');
        return;
      }
      const transport = new LineTransport(socket, rest);
      const sdk = createSdkServer();
      await sdk.connect(transport);
      socket.resume();
    } catch {
      socket.end(JSON.stringify({ error: 'AUTH_FAILED' }) + '\n');
    }
  };
  socket.on('data', onData);
}
export async function startMcpServerIfNeeded(): Promise<void> {
  const settings = await loadMcpSettings(userData());
  if (!settings.enabled || !isUnlocked() || server) return;
  const withToken = await ensureMcpToken(userData(), settings);
  const socketPath = getMcpSocketPath();
  if (process.platform !== 'win32') await fs.rm(socketPath, { force: true }).catch(() => undefined);
  server = createServer((s) => void accept(s, withToken.token ?? ''));
  server.on('error', (e) => console.error('[mcp] server error', e.message));
  await new Promise<void>((resolve, reject) =>
    server?.listen(socketPath, resolve).once('error', reject),
  );
  if (process.platform !== 'win32') await fs.chmod(socketPath, 0o600).catch(() => undefined);
  console.log('[mcp] server started');
}
export async function stopMcpServer(): Promise<void> {
  for (const s of sockets) s.destroy();
  sockets = new Set();
  const old = server;
  server = null;
  if (old) await new Promise<void>((resolve) => old.close(() => resolve()));
}
export async function getMcpStatus(): Promise<McpStatus> {
  const settings = await loadMcpSettings(userData());
  return {
    enabled: settings.enabled,
    allowWrites: settings.allowWrites,
    allowDelete: settings.allowDelete,
    running: server !== null,
    token: settings.token,
    launcherPath: getLauncherPath(),
    configSnippet: snippet(settings.token),
  };
}
// Settings mutations are read-modify-write; serialize them so rapid toggles
// can't overwrite each other.
let mutationQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationQueue.then(fn);
  mutationQueue = run.catch(() => undefined);
  return run;
}
export function setMcpOptions(options: {
  allowWrites?: boolean | undefined;
  allowDelete?: boolean | undefined;
}): Promise<McpStatus> {
  return serialized(() => applyMcpOptions(options));
}
async function applyMcpOptions(options: {
  allowWrites?: boolean | undefined;
  allowDelete?: boolean | undefined;
}): Promise<McpStatus> {
  const settings = await loadMcpSettings(userData());
  const allowWrites = options.allowWrites ?? settings.allowWrites;
  await saveMcpSettings(userData(), {
    ...settings,
    allowWrites,
    allowDelete: allowWrites ? (options.allowDelete ?? settings.allowDelete) : false,
  });
  return getMcpStatus();
}
export function setMcpEnabled(enabled: boolean): Promise<McpStatus> {
  return serialized(() => applyMcpEnabled(enabled));
}
async function applyMcpEnabled(enabled: boolean): Promise<McpStatus> {
  let settings = await loadMcpSettings(userData());
  settings = {
    ...settings,
    enabled,
    token: enabled ? (settings.token ?? createMcpToken()) : settings.token,
  };
  await saveMcpSettings(userData(), settings);
  if (enabled) await startMcpServerIfNeeded();
  else await stopMcpServer();
  return getMcpStatus();
}
export function regenerateMcpToken(): Promise<McpStatus> {
  return serialized(applyRegenerateToken);
}
async function applyRegenerateToken(): Promise<McpStatus> {
  const settings = await loadMcpSettings(userData());
  await saveMcpSettings(userData(), { ...settings, token: createMcpToken() });
  await stopMcpServer();
  await startMcpServerIfNeeded();
  return getMcpStatus();
}
