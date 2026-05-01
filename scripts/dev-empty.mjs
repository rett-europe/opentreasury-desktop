#!/usr/bin/env node
// `dev:empty` entry point — guarantee a true first-run state, then launch vite.
//
// `npm run dev:empty` exists so contributors can exercise the first-run
// onboarding wizard (#196) without manually scrubbing userData. The previous
// implementation only set `OT_SEED=none` on a plain `vite` invocation, which
// was misleading: `OT_SEED=none` only suppresses the demo seed when the
// event log is empty — it does NOT wipe pre-existing events from a prior
// `npm run dev` run, and it does NOT clear `app-config.json`. The result was
// "empty" runs that hydrated 238 events from the leftover dev-events folder
// and skipped the wizard entirely.
//
// This script wipes the dev-only state under Electron's userData (the
// `app-config.json` choice + the default-location event log directories)
// before spawning vite, so empty really means empty:
//   - userData/app-config.json  (resets the dataDir choice → wizard fires)
//   - userData/dev-events/      (legacy default; removes any seed leftovers)
//   - userData/my-data/         (post-onboarding default; only present if a
//                                previous wizard run picked "Use default")
//
// We deliberately leave `profile.json` and `device.json` alone — they are
// orthogonal to the data folder choice and survive normal "empty starts".
//
// Safety: this script ONLY operates on userData/<known-dev-paths>. It will
// NEVER touch a user-chosen data folder outside userData (those are real
// datasets and their lifecycle belongs to the user, not to this script).

import { readFile, rm, stat, unlink } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(await readFile(resolve(here, '..', 'package.json'), 'utf8'));
// Electron uses productName if set, otherwise package.name, as the userData
// folder. The dev binary currently relies on package.name.
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

const root = userDataRoot();

async function removeIfExists(target, kind) {
  try {
    await stat(target);
  } catch {
    console.log(`[dev:empty] ${kind} already absent: ${target}`);
    return;
  }
  if (kind === 'file') {
    await unlink(target);
  } else {
    await rm(target, { recursive: true, force: true });
  }
  console.log(`[dev:empty] removed ${kind}: ${target}`);
}

await removeIfExists(join(root, 'app-config.json'), 'file');
await removeIfExists(join(root, 'dev-events'), 'directory');
await removeIfExists(join(root, 'my-data'), 'directory');

console.log('[dev:empty] userData scrubbed — launching vite with OT_SEED=none');

// Spawn vite directly via its bin script. Forward the parent's argv so flags
// like `-- --port 5174` still work (npm passes them through after `--`).
const viteBin = resolve(here, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, OT_SEED: 'none' },
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
