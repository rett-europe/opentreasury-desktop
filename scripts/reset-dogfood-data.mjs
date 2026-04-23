#!/usr/bin/env node
// Wipe a dogfood event-log directory under Electron's userData path.
//
// Why: `npm run dev:empty` uses OT_DATA_DIR to isolate dogfood data from the
// demo seed (OT_DATA_DIR=my-data → %APPDATA%/opentreasury/my-data/). Running
// this script removes that folder so the next launch starts from a clean
// slate without touching the default dev-events/ seed.
//
// Platform: Windows-first (%APPDATA%/opentreasury/<subdir>). Also handles
// macOS (~/Library/Application Support/opentreasury) and Linux (~/.config/
// opentreasury) for contributor portability. The Electron app name must
// match package.json "name" (opentreasury-desktop) — but the userData folder
// takes its name from electron-builder's productName OR the package "name".
// We read package.json at runtime to stay in sync.
//
// Safety: refuses to run unless OT_DATA_DIR is set AND is a plain folder
// name (no path separators, no absolute paths). Never touches the default
// dev-events/ directory.

import { readFile, rm, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const subdir = (process.env.OT_DATA_DIR ?? '').trim();
if (!subdir) {
  console.error('[reset-dogfood-data] OT_DATA_DIR is not set — nothing to reset.');
  console.error('  Example: OT_DATA_DIR=my-data npm run dev:reset');
  process.exit(1);
}
if (/[\\/]/.test(subdir) || subdir === '..' || subdir === '.') {
  console.error(
    `[reset-dogfood-data] refusing to reset: OT_DATA_DIR=${subdir} is not a plain folder name.`,
  );
  process.exit(1);
}
if (subdir === 'dev-events') {
  console.error(
    '[reset-dogfood-data] refusing to reset the default demo-seed folder (dev-events/).',
  );
  console.error('  Pick a different OT_DATA_DIR (e.g. my-data) for dogfooding.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(resolve(here, '..', 'package.json'), 'utf8'));
// Electron uses productName if set, otherwise package.name, as the userData
// folder. This repo currently relies on package.name (no productName override
// in electron-builder.yml for the dev binary).
const appFolder = pkg.build?.productName ?? pkg.name;

function userDataRoot() {
  switch (platform()) {
    case 'win32':
      return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), appFolder);
    case 'darwin':
      return join(homedir(), 'Library', 'Application Support', appFolder);
    default:
      return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), appFolder);
  }
}

const target = join(userDataRoot(), subdir);

try {
  await stat(target);
} catch {
  console.log(`[reset-dogfood-data] nothing to remove — ${target} does not exist.`);
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
console.log(`[reset-dogfood-data] removed ${target}`);
