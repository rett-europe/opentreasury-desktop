import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';

export const mcpSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  allowWrites: z.boolean().default(false),
  allowDelete: z.boolean().default(false),
  token: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .default(null),
});
export type McpSettings = z.infer<typeof mcpSettingsSchema>;
const FILE = 'mcp.json';
export function createMcpToken(): string {
  return randomBytes(32).toString('hex');
}
export function createDefaultMcpSettings(): McpSettings {
  return mcpSettingsSchema.parse({});
}
export async function loadMcpSettings(userDataDir: string): Promise<McpSettings> {
  try {
    const raw = await fs.readFile(path.join(userDataDir, FILE), 'utf8');
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      // A corrupt file must not wedge the Preferences card; fall back to
      // defaults (MCP off) and let the next save rewrite it.
      console.warn('[mcp] mcp.json is not valid JSON; using defaults');
      return createDefaultMcpSettings();
    }
    const parsed = mcpSettingsSchema.safeParse(json);
    if (!parsed.success) return createDefaultMcpSettings();
    return parsed.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return createDefaultMcpSettings();
    throw err;
  }
}
// Saves are serialized and use a unique temp file: concurrent writers sharing
// one temp path interleaved and left trailing bytes (corrupt JSON).
let saveQueue: Promise<void> = Promise.resolve();
export function saveMcpSettings(userDataDir: string, settings: McpSettings): Promise<void> {
  const run = saveQueue.then(() => writeSettings(userDataDir, settings));
  saveQueue = run.catch(() => undefined);
  return run;
}
async function writeSettings(userDataDir: string, settings: McpSettings): Promise<void> {
  const data = mcpSettingsSchema.parse(settings);
  const file = path.join(userDataDir, FILE);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  const fh = await fs.open(tmp, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, file);
}
export async function ensureMcpToken(
  userDataDir: string,
  settings: McpSettings,
): Promise<McpSettings> {
  if (settings.token) return settings;
  const next = { ...settings, token: createMcpToken() };
  await saveMcpSettings(userDataDir, next);
  return next;
}
