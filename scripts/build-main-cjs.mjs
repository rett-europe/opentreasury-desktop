// Post-process the main process bundle from ESM to CJS.
// vite-plugin-electron emits ESM (because root package.json is type:module), but
// the main process must be CJS so Electron's asar-aware require() can resolve
// native modules (sodium-native, argon2, @napi-rs/keyring) from app.asar.unpacked.
// ESM `import` cannot follow Electron's asar.unpacked redirect.
import { build } from 'esbuild';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/**
 * Convert the vite-plugin-electron main bundle (dist/main/index.js, ESM) into
 * dist/main/index.cjs -- the file Electron actually loads (package.json "main").
 *
 * The production build deletes the intermediate index.js once converted. The dev
 * flow calls this from the electron plugin's `onstart` with `deleteJs:false`,
 * because vite-plugin-electron's incremental watch owns index.js and rebuilds it
 * on every main change; rebuilding the CJS from it before launch is what keeps
 * dev from running a STALE index.cjs left over from the last full build.
 *
 * @param {{ deleteJs?: boolean }} [options]
 * @returns {Promise<string>} the path to the written index.cjs
 */
export async function buildMainCjs({ deleteJs = true } = {}) {
  const inFile = resolve(root, 'dist/main/index.js');
  const outFile = resolve(root, 'dist/main/index.cjs');

  if (!existsSync(inFile)) {
    throw new Error(`Expected vite main output not found: ${inFile}`);
  }

  await build({
    entryPoints: [inFile],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: outFile,
    external: ['electron', 'sodium-native', 'argon2', '@napi-rs/keyring'],
    // Polyfill `import.meta.url` references for CJS output. esbuild's bundle mode
    // silently leaves `import.meta.url` as `undefined` when emitting CJS, which
    // breaks anything calling `fileURLToPath(import.meta.url)` at module init.
    define: {
      'import.meta.url': '__opentreasury_import_meta_url',
    },
    banner: {
      js: 'const __opentreasury_import_meta_url = require("url").pathToFileURL(__filename).href;',
    },
    logLevel: 'info',
    sourcemap: true,
    legalComments: 'none',
  });

  if (deleteJs) {
    unlinkSync(inFile);
    const mapFile = inFile + '.map';
    if (existsSync(mapFile)) unlinkSync(mapFile);
  }

  const launcherIn = resolve(root, 'app/src/mcp-launcher/index.ts');
  const launcherOut = resolve(root, 'dist/mcp-launcher/index.cjs');
  await build({
    entryPoints: [launcherIn],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: launcherOut,
    logLevel: 'info',
    sourcemap: true,
    legalComments: 'none',
  });

  return outFile;
}

// Direct invocation (`node scripts/build-main-cjs.mjs`, used by `npm run build`):
// convert and remove the intermediate ESM bundle.
const invokedDirectly = resolve(fileURLToPath(import.meta.url)) === resolve(argv[1] ?? '');
if (invokedDirectly) {
  buildMainCjs({ deleteJs: true })
    .then((outFile) => {
      console.log(`\u2713 Main bundle converted to CJS: ${outFile}`);
    })
    .catch((err) => {
      console.error(`\u2717 ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}
