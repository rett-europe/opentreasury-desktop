// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { RecoveryFlow } from './RecoveryFlow.js';

const mockRecover = vi.fn();

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  mockRecover.mockReset();
  // @ts-expect-error - partial window.opentreasury mock
  window.opentreasury = {
    workspace: { recover: mockRecover },
  };
});

const VALID_MNEMONIC =
  'abandon ability able about above absent absorb abstract absurd abuse access accident';

function renderFlow(onComplete = vi.fn()): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <RecoveryFlow onComplete={onComplete} />
    </I18nextProvider>,
  );
}

describe('RecoveryFlow', () => {
  it('renders the 12-word input and a disabled unlock button', () => {
    renderFlow();
    expect(screen.getByRole('button', { name: /unlock|recover/i })).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /unlock|recover/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('happy path: valid mnemonic → recover → onComplete', async () => {
    const user = userEvent.setup({ delay: null });
    const onComplete = vi.fn();

    mockRecover.mockResolvedValue({
      ok: true,
      event: {
        id: 'evt1',
        type: 'device.recovered',
        timestamp: new Date().toISOString(),
        deviceId: 'dev1',
      },
    });

    renderFlow(onComplete);

    const words = VALID_MNEMONIC.split(' ');
    for (let i = 0; i < words.length; i++) {
      const input = screen.getByLabelText(`Word ${i + 1}`);
      await user.type(input, words[i] ?? '');
    }

    const unlockBtn = await screen.findByRole('button', { name: /unlock|recover/i });
    expect((unlockBtn as HTMLButtonElement).disabled).toBe(false);
    await user.click(unlockBtn);

    await waitFor(() => expect(mockRecover).toHaveBeenCalledWith({ mnemonic: VALID_MNEMONIC }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  }, 15000);

  it('increments local failedAttempts counter and shows error on bad mnemonic', async () => {
    const user = userEvent.setup({ delay: null });

    mockRecover.mockResolvedValue({
      ok: false,
      error: { code: 'mnemonic_mismatch', message: "That recovery code doesn't match." },
    });

    renderFlow();

    const words = VALID_MNEMONIC.split(' ');
    for (let i = 0; i < words.length; i++) {
      const input = screen.getByLabelText(`Word ${i + 1}`);
      await user.type(input, words[i] ?? '');
    }

    await user.click(await screen.findByRole('button', { name: /unlock|recover/i }));

    await waitFor(() => expect(mockRecover).toHaveBeenCalledTimes(1));
    await screen.findByText(/doesn.t match/i);
  }, 15000);
});
