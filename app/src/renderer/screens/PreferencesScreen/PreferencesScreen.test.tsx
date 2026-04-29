// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { PreferencesScreen } from './PreferencesScreen.js';
import type { ConfigGetResponse } from '../../../shared/ipc-contracts/config.js';

// Mock the window.opentreasury APIs
const mockConfigGet = vi.fn();
const mockProfileGet = vi.fn();

beforeEach(() => {
  mockConfigGet.mockReset();
  mockProfileGet.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    config: {
      get: mockConfigGet,
    },
    profile: {
      get: mockProfileGet,
    },
  };
});

function makeConfigResponse(
  dataDir: string | null = null,
  readOnly: boolean = false,
): ConfigGetResponse {
  return {
    ok: true,
    config: {
      version: 1,
      dataDir,
      readOnly,
    },
    effectiveDataDir: dataDir ?? 'C:\\Users\\TestUser\\AppData\\Local\\OpenTreasury\\dev-events',
  };
}

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <PreferencesScreen />
    </I18nextProvider>,
  );
}

describe('PreferencesScreen', () => {
  it('renders loading state initially', () => {
    let resolve: (v: ConfigGetResponse) => void = () => {};
    mockConfigGet.mockImplementation(
      () =>
        new Promise<ConfigGetResponse>((r) => {
          resolve = r;
        }),
    );
    mockProfileGet.mockResolvedValue({ ok: false });
    renderWithI18n();
    // Check for loading text
    expect(screen.getByText(/loading|cargando/i)).toBeDefined();
    resolve(makeConfigResponse());
  });

  it('renders the dataset card', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue({ ok: false });
    renderWithI18n();

    await waitFor(() => {
      // Should show the dataset card heading
      expect(screen.getByRole('heading', { name: /^dataset$|^conjunto de datos$/i })).toBeDefined();
    });
  });

  it('shows read-only badge when readOnly is true', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, true));
    mockProfileGet.mockResolvedValue({ ok: false });
    renderWithI18n();

    await waitFor(() => {
      // Check for read-only badge text
      const badge = screen.queryByText(/read-only|solo lectura/i);
      expect(badge).toBeDefined();
    });
  });

  it('renders error state when API call fails', async () => {
    mockConfigGet.mockRejectedValue(new Error('Network error'));
    mockProfileGet.mockResolvedValue({ ok: false });
    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByText(/failed to load preferences/i)).toBeDefined();
    });
  });
});
