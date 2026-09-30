import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpToken, loadMcpSettings, saveMcpSettings } from './settings.js';

describe('mcp settings persistence', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-mcp-settings-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('concurrent saves never corrupt mcp.json (regression)', async () => {
    const token = createMcpToken();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        saveMcpSettings(dir, {
          enabled: i % 2 === 0,
          allowWrites: i % 3 === 0,
          allowDelete: false,
          token: i % 2 === 0 ? token : null,
        }),
      ),
    );
    const raw = await fs.readFile(path.join(dir, 'mcp.json'), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    // Last queued save wins.
    expect(await loadMcpSettings(dir)).toMatchObject({ enabled: false, allowWrites: false });
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('falls back to defaults when mcp.json is corrupt instead of throwing', async () => {
    await fs.writeFile(path.join(dir, 'mcp.json'), '{ "enabled": true }\n}', 'utf8');
    await expect(loadMcpSettings(dir)).resolves.toMatchObject({ enabled: false });
  });

  it('parses legacy files without allowWrites/allowDelete', async () => {
    await fs.writeFile(
      path.join(dir, 'mcp.json'),
      JSON.stringify({ enabled: true, token: createMcpToken() }),
      'utf8',
    );
    await expect(loadMcpSettings(dir)).resolves.toMatchObject({
      enabled: true,
      allowWrites: false,
      allowDelete: false,
    });
  });
});
