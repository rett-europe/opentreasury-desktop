import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryCodeInput } from './RecoveryCodeInput';

describe('RecoveryCodeInput', () => {
  it('renders 12 input fields', () => {
    render(<RecoveryCodeInput />);

    for (let i = 1; i <= 12; i++) {
      expect(screen.getByLabelText(`Word ${i}`)).toBeInTheDocument();
    }
  });

  it('accepts valid BIP39 words', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleValidityChange = vi.fn();

    render(<RecoveryCodeInput onChange={handleChange} onValidityChange={handleValidityChange} />);

    // Type a valid BIP39 word in the first field
    const firstInput = screen.getByLabelText('Word 1');
    await user.type(firstInput, 'abandon');

    expect(handleValidityChange).toHaveBeenCalledWith(false); // Not all fields filled yet
  });

  it('validates all 12 words before reporting valid', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    const handleValidityChange = vi.fn();

    const validWords = [
      'abandon',
      'ability',
      'able',
      'about',
      'above',
      'absent',
      'absorb',
      'abstract',
      'absurd',
      'abuse',
      'access',
      'accident',
    ];

    render(<RecoveryCodeInput onChange={handleChange} onValidityChange={handleValidityChange} />);

    // Fill all 12 fields with valid words
    for (let i = 0; i < validWords.length; i++) {
      const input = screen.getByLabelText(`Word ${i + 1}`);
      await user.type(input, validWords[i]);
    }

    // Should be valid now
    expect(handleValidityChange).toHaveBeenCalledWith(true);
    expect(handleChange).toHaveBeenCalledWith(validWords.join(' '));
  });

  it('shows error text when provided', () => {
    const errorText = 'Invalid recovery code';
    render(<RecoveryCodeInput errorText={errorText} />);

    expect(screen.getByRole('alert')).toHaveTextContent(errorText);
  });

  it('normalizes input to lowercase', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    const validWords = [
      'ABANDON',
      'ABILITY',
      'ABLE',
      'ABOUT',
      'ABOVE',
      'ABSENT',
      'ABSORB',
      'ABSTRACT',
      'ABSURD',
      'ABUSE',
      'ACCESS',
      'ACCIDENT',
    ];

    render(<RecoveryCodeInput onChange={handleChange} />);

    for (let i = 0; i < validWords.length; i++) {
      const input = screen.getByLabelText(`Word ${i + 1}`);
      await user.type(input, validWords[i]);
    }

    // Should convert to lowercase
    expect(handleChange).toHaveBeenCalledWith(validWords.join(' ').toLowerCase());
  });
});
