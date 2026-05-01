// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { OnboardingScreen } from './OnboardingScreen.js';

const mockGetStatus = vi.fn();
const mockPickFolder = vi.fn();
const mockSetDataDir = vi.fn();

beforeEach(() => {
  mockGetStatus.mockReset();
  mockPickFolder.mockReset();
  mockSetDataDir.mockReset();
  // @ts-expect-error - partial window.opentreasury mock; only the surface
  // OnboardingScreen touches.
  window.opentreasury = {
    onboarding: { getStatus: mockGetStatus },
    dialog: { pickFolder: mockPickFolder },
    config: { setDataDir: mockSetDataDir },
  };
});

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <OnboardingScreen />
    </I18nextProvider>,
  );
}

describe('OnboardingScreen', () => {
  it('renders the welcome copy and the three primary actions', async () => {
    mockGetStatus.mockResolvedValue({
      ok: true,
      needsOnboarding: true,
      defaultDataDir: 'C:\\Users\\Test\\AppData\\Roaming\\opentreasury\\my-data',
    });

    renderWithI18n();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    });

    expect(screen.getByRole('button', { name: /browse/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /use default/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeTruthy();
  });

  it('disables the Confirm button until a folder is chosen', async () => {
    mockGetStatus.mockResolvedValue({
      ok: true,
      needsOnboarding: true,
      defaultDataDir: '/home/test/.config/opentreasury/my-data',
    });

    renderWithI18n();

    const confirm = await screen.findByRole('button', { name: /confirm/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it('Browse → opens the folder picker; the chosen path is shown and Confirm enables', async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      ok: true,
      needsOnboarding: true,
      defaultDataDir: '/default',
    });
    mockPickFolder.mockResolvedValue({ ok: true, path: '/picked/folder' });

    renderWithI18n();

    const browse = await screen.findByRole('button', { name: /browse/i });
    await user.click(browse);

    await waitFor(() => {
      expect(mockPickFolder).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByTestId('ot-onboarding-selected-path').textContent).toContain(
      '/picked/folder',
    );

    const confirm = screen.getByRole('button', { name: /confirm/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
  });

  it('Use default → preselects the suggested path and confirm sends bypassLocationCheck=true', async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      ok: true,
      needsOnboarding: true,
      defaultDataDir: '/userdata/my-data',
    });
    mockSetDataDir.mockResolvedValue({ ok: true });

    renderWithI18n();

    const useDefault = await screen.findByRole('button', { name: /use default/i });
    await user.click(useDefault);

    expect(screen.getByTestId('ot-onboarding-selected-path').textContent).toContain(
      '/userdata/my-data',
    );

    const confirm = screen.getByRole('button', { name: /confirm/i });
    await user.click(confirm);

    await waitFor(() => {
      expect(mockSetDataDir).toHaveBeenCalledWith({
        newDir: '/userdata/my-data',
        confirmDatasetSwitch: true,
        bypassLocationCheck: true,
      });
    });
  });

  it('Browse → Confirm sends bypassLocationCheck=false (only the default path bypasses)', async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      ok: true,
      needsOnboarding: true,
      defaultDataDir: '/userdata/my-data',
    });
    mockPickFolder.mockResolvedValue({ ok: true, path: '/external/treasury' });
    mockSetDataDir.mockResolvedValue({ ok: true });

    renderWithI18n();

    await user.click(await screen.findByRole('button', { name: /browse/i }));
    await user.click(await screen.findByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(mockSetDataDir).toHaveBeenCalledWith({
        newDir: '/external/treasury',
        confirmDatasetSwitch: true,
        bypassLocationCheck: false,
      });
    });
  });

  it('surfaces the main-process error when setDataDir fails', async () => {
    const user = userEvent.setup();
    mockGetStatus.mockResolvedValue({
      ok: true,
      needsOnboarding: true,
      defaultDataDir: '/userdata/my-data',
    });
    mockPickFolder.mockResolvedValue({ ok: true, path: '/some/path' });
    mockSetDataDir.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_WRITABLE', message: 'Folder is not writable' },
    });

    renderWithI18n();

    await user.click(await screen.findByRole('button', { name: /browse/i }));
    await user.click(await screen.findByRole('button', { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Folder is not writable');
    });
  });
});
