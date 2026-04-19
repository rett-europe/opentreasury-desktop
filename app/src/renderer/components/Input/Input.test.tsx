// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from './Input.js';

describe('Input', () => {
  it('renders label associated with the input', () => {
    render(<Input label="Nombre" />);
    const input = screen.getByLabelText('Nombre');
    expect(input).toBeDefined();
  });

  it('passes through value and onChange', () => {
    let value = '';
    render(
      <Input
        label="X"
        value={value}
        onChange={(e) => {
          value = e.target.value;
        }}
      />,
    );
    const input = screen.getByLabelText('X') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(value).toBe('abc');
  });

  it('surfaces error state via aria-invalid and role=alert', () => {
    render(<Input label="Amount" errorText="Invalid" />);
    const input = screen.getByLabelText('Amount');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Invalid');
  });

  it('marks required fields with aria-required and screen-reader text', () => {
    render(<Input label="Account" required />);
    const input = screen.getByLabelText(/Account/);
    expect(input.getAttribute('aria-required')).toBe('true');
  });
});
