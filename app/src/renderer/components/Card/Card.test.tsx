// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card } from './Card.js';

describe('Card', () => {
  it('renders children inside the surface', () => {
    render(
      <Card>
        <span>Hi</span>
      </Card>,
    );
    expect(screen.getByText('Hi')).toBeDefined();
  });

  it('applies padding variant', () => {
    const { container } = render(<Card padding="lg">x</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('ot-card--pad-lg');
  });

  it('applies subtle tone and flat modifier', () => {
    const { container } = render(
      <Card tone="subtle" flat>
        x
      </Card>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('ot-card--subtle');
    expect(el.className).toContain('ot-card--flat');
  });

  it('omits padding class when padding="none"', () => {
    const { container } = render(<Card padding="none">x</Card>);
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).not.toContain('ot-card--pad-');
  });
});
