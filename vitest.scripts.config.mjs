import { defineConfig } from 'vitest/config';

// Vitest config for standalone Node scripts.
// Run with: npx vitest run --config vitest.scripts.config.mjs
export default defineConfig({
  test: {
    include: ['scripts/__tests__/**/*.test.mjs'],
    environment: 'node',
    globals: false,
    testTimeout: 120_000, // Argon2id KDF takes ~500ms; allow for slow CI
  },
});
