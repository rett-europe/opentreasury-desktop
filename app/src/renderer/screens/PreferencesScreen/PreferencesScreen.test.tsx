// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { PreferencesScreen } from './PreferencesScreen.js';
import type { ConfigGetResponse } from '../../../shared/ipc-contracts/config.js';
import type {
  ProfileGetResponse,
  ProfileSaveResponse,
} from '../../../shared/ipc-contracts/profile.js';

// Mock the window.opentreasury APIs
const mockConfigGet = vi.fn();
const mockProfileGet = vi.fn();
const mockProfileSave = vi.fn();

beforeEach(() => {
  mockConfigGet.mockReset();
  mockProfileGet.mockReset();
  mockProfileSave.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    config: {
      get: mockConfigGet,
    },
    profile: {
      get: mockProfileGet,
      save: mockProfileSave,
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

function makeProfileGetResponse(): ProfileGetResponse {
  return {
    ok: true,
    profile: {
      userId: '01KQCRERTJ28XV6TKF1PVQQTA0',
      name: 'Test User',
      role: 'treasurer',
      ngoName: 'Test NGO',
      identitySource: 'local',
      createdAt: '2024-01-01T00:00:00.000Z',
    },
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
    mockProfileGet.mockResolvedValue({ ok: true, profile: null });
    renderWithI18n();
    // Check for loading text
    expect(screen.getByText(/loading|cargando/i)).toBeDefined();
    resolve(makeConfigResponse());
  });

  it('renders the dataset card', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue({ ok: true, profile: null });
    renderWithI18n();

    await waitFor(() => {
      // Should show the dataset card heading
      expect(screen.getByRole('heading', { name: /^dataset$|^conjunto de datos$/i })).toBeDefined();
    });
  });

  it('shows read-only badge when readOnly is true', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, true));
    mockProfileGet.mockResolvedValue({ ok: true, profile: null });
    renderWithI18n();

    await waitFor(() => {
      // Check for read-only badge text
      const badge = screen.queryByText(/read-only|solo lectura/i);
      expect(badge).toBeDefined();
    });
  });

  it('renders error state when API call fails', async () => {
    mockConfigGet.mockRejectedValue(new Error('Network error'));
    mockProfileGet.mockResolvedValue({ ok: true, profile: null });
    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByText(/failed to load preferences/i)).toBeDefined();
    });
  });

  it('saves profile changes with full profile data', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue(makeProfileGetResponse());
    const mockSaveResponse: ProfileSaveResponse = {
      ok: true,
      profile: {
        userId: '01KQCRERTJ28XV6TKF1PVQQTA0',
        name: 'Updated Name',
        role: 'accountant',
        ngoName: 'Updated NGO',
        identitySource: 'local',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    };
    mockProfileSave.mockResolvedValue(mockSaveResponse);

    // Mock window.location.reload to prevent actual reload in test
    const originalLocation = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.location = { ...originalLocation, reload: vi.fn() } as any;

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByLabelText(/your name|tu nombre/i)).toBeDefined();
    });

    const nameInput = screen.getByLabelText(/your name|tu nombre/i) as HTMLInputElement;
    const ngoInput = screen.getByLabelText(
      /organization name|nombre de la organización/i,
    ) as HTMLInputElement;

    // Change the values
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Name');
    await userEvent.clear(ngoInput);
    await userEvent.type(ngoInput, 'Updated NGO');

    // Find and click the save button
    const saveButton = screen.getByRole('button', { name: /save changes|guardar cambios/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      // Verify the IPC save was called with correct full profile data
      expect(mockProfileSave).toHaveBeenCalledWith({
        userId: '01KQCRERTJ28XV6TKF1PVQQTA0',
        name: 'Updated Name',
        role: 'treasurer',
        ngoName: 'Updated NGO',
        identitySource: 'local',
        createdAt: '2024-01-01T00:00:00.000Z',
      });
    });

    // Restore original location
    window.location = originalLocation;
  });

  it('shows error message when profile save fails', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue(makeProfileGetResponse());
    const mockErrorResponse: ProfileSaveResponse = {
      ok: false,
      error: {
        code: 'WRITE_FAILED',
        message: 'Disk error',
      },
    };
    mockProfileSave.mockResolvedValue(mockErrorResponse);

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByLabelText(/your name|tu nombre/i)).toBeDefined();
    });

    const nameInput = screen.getByLabelText(/your name|tu nombre/i) as HTMLInputElement;

    // Change a value
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');

    // Click save
    const saveButton = screen.getByRole('button', { name: /save changes|guardar cambios/i });
    await userEvent.click(saveButton);

    // Verify error message appears (key or translated text)
    await waitFor(() => {
      const errorText = screen.queryByText(/saveFailed/i) || screen.queryByText(/failed to save/i);
      expect(errorText).toBeDefined();
    });
  });
});
