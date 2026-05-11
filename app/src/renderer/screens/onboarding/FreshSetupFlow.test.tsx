// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { FreshSetupFlow } from './FreshSetupFlow.js';

const mockCreate = vi.fn();
const mockConfirmSetup = vi.fn();
const mockPickFolder = vi.fn();

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  mockCreate.mockReset();
  mockConfirmSetup.mockReset();
  mockPickFolder.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    workspace: { create: mockCreate, confirmSetup: mockConfirmSetup },
    dialog: { pickFolder: mockPickFolder },
  };
});

const TEST_MNEMONIC =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';
const TEST_SETUP_TOKEN = 'tok_test_01';

function renderFlow(onComplete = vi.fn()): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <FreshSetupFlow onComplete={onComplete} />
    </I18nextProvider>,
  );
}

describe('FreshSetupFlow', () => {
  it('starts on the folder picker screen', () => {
    renderFlow();
    // FolderPickerScreen renders the choose-folder button
    expect(screen.getByRole('button', { name: /choose folder/i })).toBeTruthy();
  });

  it('happy path: folder → display → confirm → complete → onComplete', async () => {
    const user = userEvent.setup({ delay: null });
    const onComplete = vi.fn();

    mockPickFolder.mockResolvedValue({ ok: true, path: '/my/treasury' });
    mockCreate.mockResolvedValue({
      ok: true,
      mnemonic: TEST_MNEMONIC,
      setupToken: TEST_SETUP_TOKEN,
    });
    mockConfirmSetup.mockResolvedValue({
      ok: true,
      event: {
        id: 'evt1',
        type: 'workspace.created',
        timestamp: new Date().toISOString(),
        workspaceId: 'ws1',
      },
    });

    renderFlow(onComplete);

    // Step 1 — pick a folder
    await user.click(screen.getByRole('button', { name: /choose folder/i }));
    await waitFor(() => expect(mockPickFolder).toHaveBeenCalledTimes(1));

    // The "Continue" button should appear once a folder is selected
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    // workspace:create should be called
    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith({ folderPath: '/my/treasury' }));

    // Step 2 — recovery code display screen should appear (contains mnemonic word "abandon")
    await screen.findByText('abandon');

    // Click the display-screen "Next" button
    const nextBtn = await screen.findByRole('button', { name: /next|continue|done|written/i });
    await user.click(nextBtn);

    // Step 3 — confirm screen — find the 3 challenge inputs
    const challengeInputs = await screen.findAllByRole('textbox');
    expect(challengeInputs.length).toBe(3);

    // Determine which positions the challenge picked, then type the correct words
    const labels = screen.getAllByText(/Word #\d+/);
    const words = TEST_MNEMONIC.split(' ');
    for (let i = 0; i < labels.length; i++) {
      const match = labels[i].textContent?.match(/Word #(\d+)/);
      const pos = match ? parseInt(match[1], 10) : 1;
      await user.type(challengeInputs[i], words[pos - 1] ?? '');
    }

    // The confirm button should now be enabled
    const confirmBtn = await screen.findByRole('button', { name: /continue/i });
    expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    await user.click(confirmBtn);

    // workspace:confirmSetup should be called
    await waitFor(() => expect(mockConfirmSetup).toHaveBeenCalledTimes(1));

    // Step 4 — setup complete screen
    await screen.findByText(/workspace is encrypted/i);

    // Click final continue
    const doneBtn = await screen.findByRole('button', { name: /continue|go to dashboard/i });
    await user.click(doneBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
  }, 20000);

  it('shows an inline error if workspace:create fails', async () => {
    const user = userEvent.setup();

    mockPickFolder.mockResolvedValue({ ok: true, path: '/bad/path' });
    mockCreate.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_WRITABLE', message: 'Folder is not writable' },
    });

    renderFlow();

    await user.click(screen.getByRole('button', { name: /choose folder/i }));
    await waitFor(() => expect(mockPickFolder).toHaveBeenCalled());
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    await screen.findByText(/not writable/i);
  });
});
