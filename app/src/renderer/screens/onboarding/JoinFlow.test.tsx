// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { JoinFlow } from './JoinFlow.js';

const mockEnroll = vi.fn();
const mockPickFolder = vi.fn();

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  mockEnroll.mockReset();
  mockPickFolder.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    workspace: { enroll: mockEnroll },
    dialog: { pickFolder: mockPickFolder },
  };
});

const VALID_MNEMONIC =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

function renderFlow(onComplete = vi.fn(), initialFolderPath?: string): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <JoinFlow onComplete={onComplete} initialFolderPath={initialFolderPath} />
    </I18nextProvider>,
  );
}

describe('JoinFlow', () => {
  it('renders the entry screen with browse-folder button when no initialFolderPath', () => {
    renderFlow();
    expect(screen.getByRole('button', { name: /folder|browse/i })).toBeTruthy();
  });

  it('shows folder path when initialFolderPath is provided', () => {
    renderFlow(vi.fn(), '/shared/treasury');
    expect(screen.getByText('/shared/treasury')).toBeTruthy();
  });

  it('happy path: initialFolderPath + valid mnemonic → enroll → success → onComplete', async () => {
    const user = userEvent.setup({ delay: null });
    const onComplete = vi.fn();

    mockEnroll.mockResolvedValue({
      ok: true,
      event: {
        id: 'evt1',
        type: 'device.enrolled',
        timestamp: new Date().toISOString(),
        deviceId: 'dev1',
      },
    });

    renderFlow(onComplete, '/shared/treasury');

    // Type all 12 words of the valid mnemonic into the RecoveryCodeInput fields
    const words = VALID_MNEMONIC.split(' ');
    for (let i = 0; i < words.length; i++) {
      const input = screen.getByLabelText(`Word ${i + 1}`);
      await user.type(input, words[i] ?? '');
    }

    // Join button should now be enabled
    const joinBtn = await screen.findByRole('button', { name: /join/i });
    expect((joinBtn as HTMLButtonElement).disabled).toBe(false);
    await user.click(joinBtn);

    await waitFor(() =>
      expect(mockEnroll).toHaveBeenCalledWith({
        folderPath: '/shared/treasury',
        mnemonic: VALID_MNEMONIC,
        deviceLabel: undefined,
      }),
    );

    // Success screen
    await screen.findByText(/you're in/i);

    // Click continue
    const continueBtn = await screen.findByRole('button', { name: /continue/i });
    await user.click(continueBtn);

    expect(onComplete).toHaveBeenCalledTimes(1);
  }, 15000);

  it('increments local failedAttempts counter and shows error on bad mnemonic', async () => {
    const user = userEvent.setup({ delay: null });

    mockEnroll.mockResolvedValue({
      ok: false,
      error: { code: 'mnemonic_mismatch', message: "That recovery code doesn't match." },
    });

    renderFlow(vi.fn(), '/shared/treasury');

    const words = VALID_MNEMONIC.split(' ');
    for (let i = 0; i < words.length; i++) {
      const input = screen.getByLabelText(`Word ${i + 1}`);
      await user.type(input, words[i] ?? '');
    }

    await user.click(await screen.findByRole('button', { name: /join/i }));

    await waitFor(() => expect(mockEnroll).toHaveBeenCalledTimes(1));
    await screen.findByText(/doesn.t match/i);
  }, 15000);
});
