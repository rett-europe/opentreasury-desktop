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
const mockConfigSetDataDir = vi.fn();
const mockProfileGet = vi.fn();
const mockProfileSave = vi.fn();
const mockPickFolder = vi.fn();

beforeEach(() => {
  mockConfigGet.mockReset();
  mockConfigSetDataDir.mockReset();
  mockProfileGet.mockReset();
  mockProfileSave.mockReset();
  mockPickFolder.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    config: {
      get: mockConfigGet,
      setDataDir: mockConfigSetDataDir,
    },
    profile: {
      get: mockProfileGet,
      save: mockProfileSave,
    },
    dialog: {
      pickFolder: mockPickFolder,
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

    // Verify error message appears (translated text, not raw key)
    await waitFor(() => {
      const errorText =
        screen.queryByText(/failed to save profile/i) ||
        screen.queryByText(/error al guardar el perfil/i);
      expect(errorText).toBeDefined();
      // Ensure we're NOT showing the raw i18n key
      expect(screen.queryByText('preferences.profile.saveFailed')).toBeNull();
    });
  });

  it('shows per-field error when ngoName is empty and clears on input', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue(makeProfileGetResponse());

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByLabelText(/organization name|nombre de la organización/i)).toBeDefined();
    });

    const ngoInput = screen.getByLabelText(
      /organization name|nombre de la organización/i,
    ) as HTMLInputElement;

    // Clear the ngo name
    await userEvent.clear(ngoInput);

    // Click save
    const saveButton = screen.getByRole('button', { name: /save changes|guardar cambios/i });
    await userEvent.click(saveButton);

    // Verify field-specific error appears (not raw key)
    await waitFor(() => {
      const errorText =
        screen.queryByText(/organization name is required/i) ||
        screen.queryByText(/nombre de la organización es obligatorio/i);
      expect(errorText).toBeDefined();
      // Ensure we're NOT showing raw keys
      expect(screen.queryByText(/preferences\.profile/)).toBeNull();
    });

    // Now type the org name back — error should clear immediately
    await userEvent.type(ngoInput, 'Test NGO');

    await waitFor(() => {
      const errorText =
        screen.queryByText(/organization name is required/i) ||
        screen.queryByText(/nombre de la organización es obligatorio/i);
      expect(errorText).toBeNull();
    });

    // Save button should be enabled
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows per-field error when name is empty and clears on input', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue(makeProfileGetResponse());

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByLabelText(/your name|tu nombre/i)).toBeDefined();
    });

    const nameInput = screen.getByLabelText(/your name|tu nombre/i) as HTMLInputElement;

    // Clear the name
    await userEvent.clear(nameInput);

    // Click save
    const saveButton = screen.getByRole('button', { name: /save changes|guardar cambios/i });
    await userEvent.click(saveButton);

    // Verify field-specific error appears
    await waitFor(() => {
      const errorText =
        screen.queryByText(/^name is required$/i) ||
        screen.queryByText(/^el nombre es obligatorio$/i);
      expect(errorText).toBeDefined();
    });

    // Type the name back — error should clear
    await userEvent.type(nameInput, 'Test User');

    await waitFor(() => {
      const errorText =
        screen.queryByText(/^name is required$/i) ||
        screen.queryByText(/^el nombre es obligatorio$/i);
      expect(errorText).toBeNull();
    });

    // Save button should be enabled
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('enables save button after failed save when user retypes same value', async () => {
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
      expect(screen.getByLabelText(/organization name|nombre de la organización/i)).toBeDefined();
    });

    const ngoInput = screen.getByLabelText(
      /organization name|nombre de la organización/i,
    ) as HTMLInputElement;

    // Clear and trigger save failure
    await userEvent.clear(ngoInput);
    await userEvent.type(ngoInput, 'Different NGO');

    const saveButton = screen.getByRole('button', { name: /save changes|guardar cambios/i });
    await userEvent.click(saveButton);

    // Wait for error to appear
    await waitFor(() => {
      const errorText =
        screen.queryByText(/failed to save profile/i) ||
        screen.queryByText(/error al guardar el perfil/i);
      expect(errorText).toBeDefined();
    });

    // Now type back the original value
    await userEvent.clear(ngoInput);
    await userEvent.type(ngoInput, 'Test NGO');

    // Error should clear
    await waitFor(() => {
      const errorText =
        screen.queryByText(/failed to save profile/i) ||
        screen.queryByText(/error al guardar el perfil/i);
      expect(errorText).toBeNull();
    });

    // Save button should be enabled even though value matches original
    // (because a save attempt failed, user is trying to retry)
    expect((saveButton as HTMLButtonElement).disabled).toBe(false);
  });

  it('re-enables dataset switch button after corp-storage validation error', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue({ ok: true, profile: null });

    // Mock picking c:\temp (Pedro's exact reproduction case)
    mockPickFolder.mockResolvedValue({
      ok: true,
      path: 'c:\\temp',
      cancelled: false,
    });

    // IPC should NOT be called — renderer validates locally now

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^dataset$|^conjunto de datos$/i })).toBeDefined();
    });

    // Find the Change button (labeled "Change..." or "Cambiar...")
    const changeButton = screen.getByRole('button', { name: /^change|^cambiar/i });

    // Button should be enabled initially
    expect((changeButton as HTMLButtonElement).disabled).toBe(false);

    // Click the button
    await userEvent.click(changeButton);

    // Wait for error to appear (Spanish: "deben residir en", English: "must live inside")
    await waitFor(() => {
      const errorText = screen.queryByText(
        /must live inside.*OneDrive for Business|deben residir en.*OneDrive para empresas/i,
      );
      expect(errorText).toBeDefined();
    });

    // Button should be enabled again (not stuck disabled)
    expect((changeButton as HTMLButtonElement).disabled).toBe(false);

    // setDataDir should NOT have been called (validation happens in renderer)
    expect(mockConfigSetDataDir).not.toHaveBeenCalled();

    // Click again to retry
    await userEvent.click(changeButton);

    // Should call picker again but still not call setDataDir
    await waitFor(() => {
      expect(mockPickFolder).toHaveBeenCalledTimes(2);
    });
    expect(mockConfigSetDataDir).not.toHaveBeenCalled();
  });

  it('clears previous error when starting new dataset switch attempt', async () => {
    mockConfigGet.mockResolvedValue(makeConfigResponse(null, false));
    mockProfileGet.mockResolvedValue({ ok: true, profile: null });

    // First attempt: c:\temp (local folder — renderer validates)
    mockPickFolder.mockResolvedValueOnce({
      ok: true,
      path: 'c:\\temp',
      cancelled: false,
    });

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /^dataset$|^conjunto de datos$/i })).toBeDefined();
    });

    const changeButton = screen.getByRole('button', { name: /^change|^cambiar/i });

    // First click
    await userEvent.click(changeButton);

    // Wait for first error (Spanish: "deben residir en", English: "must live inside")
    await waitFor(() => {
      const errorText = screen.queryByText(
        /must live inside.*OneDrive for Business|deben residir en.*OneDrive para empresas/i,
      );
      expect(errorText).toBeDefined();
    });

    // Second attempt: user cancels
    mockPickFolder.mockResolvedValueOnce({
      ok: true,
      path: null,
      cancelled: true,
    });

    // Click again
    await userEvent.click(changeButton);

    // Previous error should be gone
    await waitFor(() => {
      const errorText = screen.queryByText(
        /must live inside.*OneDrive for Business|deben residir en.*OneDrive para empresas/i,
      );
      expect(errorText).toBeNull();
    });
  });
});
