// Post-process the main process bundle from ESM to CJS.
// vite-plugin-electron emits ESM (because root package.json is type:module), but
// the main process must be CJS so Electron's asar-aware require() can resolve
// native modules (sodium-native, argon2, @napi-rs/keyring) from app.asar.unpacked.
// ESM `import` cannot follow Electron's asar.unpacked redirect.
import { build } from 'esbuild';
import { existsSync, unlinkSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const inFile = resolve(root, 'dist/main/index.js');
const outFile = resolve(root, 'dist/main/index.cjs');

if (!existsSync(inFile)) {
  console.error(`✗ Expected vite output not found: ${inFile}`);
  process.exit(1);
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

unlinkSync(inFile);
const mapFile = inFile + '.map';
if (existsSync(mapFile)) unlinkSync(mapFile);

console.log(`✓ Main bundle converted to CJS: ${outFile}`);
