// Tests for shouldSeed() logic in bootstrap.ts
//
// Validates that packaged builds never seed, and that dev-time overrides
// (NODE_ENV, OT_SEED) still work as expected.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { shouldSeed } from './bootstrap.js';

describe('shouldSeed() — dev-seed gate logic', () => {
  let originalNodeEnv: string | undefined;
  let originalOtSeed: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env['NODE_ENV'];
    originalOtSeed = process.env['OT_SEED'];
  });

  afterEach(() => {
    // Restore original env vars
    if (originalNodeEnv !== undefined) {
      process.env['NODE_ENV'] = originalNodeEnv;
    } else {
      delete process.env['NODE_ENV'];
    }

    if (originalOtSeed !== undefined) {
      process.env['OT_SEED'] = originalOtSeed;
    } else {
      delete process.env['OT_SEED'];
    }
  });

  it('returns false when isPackaged is true (production build)', () => {
    delete process.env['NODE_ENV'];
    delete process.env['OT_SEED'];

    expect(shouldSeed(true)).toBe(false);
  });

  it('returns false when isPackaged is true, even if NODE_ENV is unset', () => {
    delete process.env['NODE_ENV'];
    delete process.env['OT_SEED'];

    expect(shouldSeed(true)).toBe(false);
  });

  it('returns false when isPackaged is true, even if OT_SEED is unset', () => {
    delete process.env['NODE_ENV'];
    delete process.env['OT_SEED'];

    expect(shouldSeed(true)).toBe(false);
  });

  it('returns false when NODE_ENV is production (unpackaged dev override)', () => {
    process.env['NODE_ENV'] = 'production';
    delete process.env['OT_SEED'];

    expect(shouldSeed(false)).toBe(false);
  });

  it('returns false when OT_SEED is "none" (case-insensitive)', () => {
    delete process.env['NODE_ENV'];
    process.env['OT_SEED'] = 'none';

    expect(shouldSeed(false)).toBe(false);

    process.env['OT_SEED'] = 'NONE';
    expect(shouldSeed(false)).toBe(false);

    process.env['OT_SEED'] = 'NoNe';
    expect(shouldSeed(false)).toBe(false);
  });

  it('returns false when OT_SEED is "0"', () => {
    delete process.env['NODE_ENV'];
    process.env['OT_SEED'] = '0';

    expect(shouldSeed(false)).toBe(false);
  });

  it('returns false when OT_SEED is "false" (case-insensitive)', () => {
    delete process.env['NODE_ENV'];
    process.env['OT_SEED'] = 'false';

    expect(shouldSeed(false)).toBe(false);

    process.env['OT_SEED'] = 'FALSE';
    expect(shouldSeed(false)).toBe(false);
  });

  it('returns true when isPackaged is false, NODE_ENV is not production, and OT_SEED is unset (default dev workflow)', () => {
    delete process.env['NODE_ENV'];
    delete process.env['OT_SEED'];

    expect(shouldSeed(false)).toBe(true);
  });

  it('returns true when isPackaged is false, NODE_ENV is development, and OT_SEED is unset', () => {
    process.env['NODE_ENV'] = 'development';
    delete process.env['OT_SEED'];

    expect(shouldSeed(false)).toBe(true);
  });

  it('returns true when isPackaged is false and OT_SEED is set to any other value', () => {
    delete process.env['NODE_ENV'];
    process.env['OT_SEED'] = 'yes';

    expect(shouldSeed(false)).toBe(true);

    process.env['OT_SEED'] = '1';
    expect(shouldSeed(false)).toBe(true);

    process.env['OT_SEED'] = 'whatever';
    expect(shouldSeed(false)).toBe(true);
  });

  it('handles OT_SEED with leading/trailing whitespace', () => {
    delete process.env['NODE_ENV'];
    process.env['OT_SEED'] = '  none  ';

    expect(shouldSeed(false)).toBe(false);

    process.env['OT_SEED'] = '  0  ';
    expect(shouldSeed(false)).toBe(false);

    process.env['OT_SEED'] = '  false  ';
    expect(shouldSeed(false)).toBe(false);
  });

  it('isPackaged takes precedence over all env vars', () => {
    // Even if we try to force seeding via env vars, isPackaged=true wins
    process.env['NODE_ENV'] = 'development';
    process.env['OT_SEED'] = '1';

    expect(shouldSeed(true)).toBe(false);
  });
});
