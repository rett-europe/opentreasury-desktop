// Tests for app:get-version IPC handler — #261 trial-polish.
//
// Simple smoke test: handler calls the injected getVersion() dependency and
// returns the version string in the expected response shape.

import { describe, it, expect, vi } from 'vitest';
import { createAppGetVersionHandler } from './app.js';

describe('app:get-version handler', () => {
  it('returns the version from the injected dependency', async () => {
    const mockGetVersion = vi.fn(() => '1.2.3');
    const handler = createAppGetVersionHandler({ getVersion: mockGetVersion });

    const response = await handler({});

    expect(response).toEqual({ version: '1.2.3' });
    expect(mockGetVersion).toHaveBeenCalledTimes(1);
  });

  it('returns empty string if getVersion returns empty string', async () => {
    const mockGetVersion = vi.fn(() => '');
    const handler = createAppGetVersionHandler({ getVersion: mockGetVersion });

    const response = await handler({});

    expect(response).toEqual({ version: '' });
  });
});
