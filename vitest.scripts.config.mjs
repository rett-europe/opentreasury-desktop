import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

// Compute the repo root as a forward-slash path so the include glob works
// consistently on both Windows and POSIX. Using fileURLToPath + path.resolve
// then normalising to forward slashes avoids esbuild/micromatch failures that
// occur on Windows when drive-letter paths (C:\...) are fed into the glob
// engine directly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptsTests = path
  .resolve(__dirname, 'scripts/__tests__/**/*.test.mjs')
  .replace(/\\/g, '/');

// Vitest config for standalone Node scripts.
// Run with: npx vitest run --config vitest.scripts.config.mjs
export default defineConfig({
  test: {
    include: [scriptsTests],
    environment: 'node',
    globals: false,
    testTimeout: 120_000, // Argon2id KDF takes ~500ms; allow for slow CI
  },
});