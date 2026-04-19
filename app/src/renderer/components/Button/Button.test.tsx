// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button.js';

describe('Button', () => {
  it('renders the label', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDefined();
  });

  it('applies the variant class', () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole('button', { name: 'Primary' });
    expect(btn.className).toContain('ot-button--primary');
  });

  it('applies the size class', () => {
    render(
      <Button size="lg" variant="secondary">
        Big
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Big' });
    expect(btn.className).toContain('ot-button--lg');
  });

  it('fires onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('sets aria-busy and blocks click when loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Loading
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Loading' });
    expect(btn.getAttribute('aria-busy')).toBe('true');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is disabled when disabled prop is set', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Nope
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults type to "button" (does not submit forms)', () => {
    render(<Button>Safe</Button>);
    const btn = screen.getByRole('button', { name: 'Safe' }) as HTMLButtonElement;
    expect(btn.type).toBe('button');
  });
});
