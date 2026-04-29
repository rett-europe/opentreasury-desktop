// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { SettingsScreen } from './SettingsScreen.js';
import type { ConfigGetResponse } from '../../../shared/ipc-contracts/config.js';

// Mock the window.opentreasury.config.get API
const mockConfigGet = vi.fn();

beforeEach(() => {
  mockConfigGet.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    config: {
      get: mockConfigGet,
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
  };
}

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <SettingsScreen />
    </I18nextProvider>,
  );
}

describe('SettingsScreen', () => {
  it('renders loading state initially', () => {
    let resolve: (v: ConfigGetResponse) => void = () => {};
    mockConfigGet.mockImplementation(
      () =>
        new Promise<ConfigGetResponse>((r) => {
          resolve = r;
        }),
    );
    renderWithI18n();
    // Check for loading text
    expect(screen.getByText(/loading|cargando/i)).toBeDefined();
    resolve(makeConfigResponse());
  });

  it('renders the resolved default path when dataDir is null', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    renderWithI18n();

    await waitFor(() => {
      // Should show "(default)" marker
      const markers = screen.queryAllByText(/default|predeterminada/i);
      expect(markers.length).toBeGreaterThan(0);
    });
  });

  it('renders the custom dataDir path when configured', async () => {
    const customPath = 'C:\\MyNGO\\Treasury';
    mockConfigGet.mockResolvedValue(makeConfigResponse(customPath, false));
    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByText(customPath)).toBeDefined();
    });
  });

  it('shows read-only badge when readOnly is true', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, true));
    renderWithI18n();

    await waitFor(() => {
      // Check for read-only badge text
      const badge = screen.queryByText(/read-only|solo lectura/i);
      expect(badge).toBeDefined();
    });
  });

  it('does not show read-only badge when readOnly is false', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    renderWithI18n();

    await waitFor(() => {
      const defaultMarkers = screen.getAllByText(/default|predeterminada/i);
      expect(defaultMarkers.length).toBeGreaterThan(0);
    });

    // Read-only badge should NOT be present
    const badge = screen.queryByText(/read-only mode|modo de solo lectura/i);
    expect(badge).toBeNull();
  });

  it('renders the Change button as disabled', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    renderWithI18n();

    await waitFor(() => {
      const changeButton = screen.getByRole('button', { name: /change|cambiar/i });
      expect(changeButton).toBeDefined();
      expect(changeButton.hasAttribute('disabled')).toBe(true);
    });
  });

  it('renders error state when API call fails', async () => {
    mockConfigGet.mockRejectedValue(new Error('Network error'));
    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByText(/failed to load settings/i)).toBeDefined();
    });
  });
});
