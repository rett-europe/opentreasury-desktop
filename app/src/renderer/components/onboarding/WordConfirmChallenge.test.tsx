import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordConfirmChallenge } from './WordConfirmChallenge';

describe('WordConfirmChallenge', () => {
  const testMnemonic =
    'abandon ability able about above absent absorb abstract absurd abuse access accident';

  it('picks 3 random positions from the mnemonic', () => {
    render(<WordConfirmChallenge mnemonic={testMnemonic} />);

    // Should have 3 input fields
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(3);
  });

  it('validates correct entries', async () => {
    const user = userEvent.setup();
    const handleValidityChange = vi.fn();

    render(
      <WordConfirmChallenge mnemonic={testMnemonic} onValidityChange={handleValidityChange} />,
    );

    // Find which positions were selected
    const labels = screen.getAllByText(/Word #\d+/);
    const positions = labels.map((label) => {
      const match = label.textContent?.match(/Word #(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });

    const words = testMnemonic.split(' ');

    // Fill in correct words
    const inputs = screen.getAllByRole('textbox');
    for (let i = 0; i < positions.length; i++) {
      await user.type(inputs[i], words[positions[i] - 1]);
    }

    expect(handleValidityChange).toHaveBeenCalledWith(true);
  });

  it('rejects wrong entries', async () => {
    const user = userEvent.setup();
    const handleValidityChange = vi.fn();

    render(
      <WordConfirmChallenge mnemonic={testMnemonic} onValidityChange={handleValidityChange} />,
    );

    const inputs = screen.getAllByRole('textbox');

    // Fill in wrong words
    await user.type(inputs[0], 'wrongword');

    expect(handleValidityChange).toHaveBeenCalledWith(false);
  });

  it('shows error on blur if input is wrong', async () => {
    const user = userEvent.setup();

    render(<WordConfirmChallenge mnemonic={testMnemonic} />);

    const inputs = screen.getAllByRole('textbox');

    // Type wrong word and blur
    await user.type(inputs[0], 'wrongword');
    await user.tab();

    expect(screen.getByText('Incorrect')).toBeInTheDocument();
  });
});
