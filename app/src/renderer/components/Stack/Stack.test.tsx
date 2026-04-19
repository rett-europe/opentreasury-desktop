// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Stack } from './Stack.js';

describe('Stack', () => {
  it('defaults to a column with gap token', () => {
    const { container } = render(
      <Stack>
        <span>A</span>
      </Stack>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('ot-stack--column');
    expect(el.style.gap).toContain('var(--space-3)');
  });

  it('switches to row direction', () => {
    const { container } = render(
      <Stack direction="row" gap={4}>
        <span>A</span>
      </Stack>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('ot-stack--row');
    expect(el.style.gap).toContain('var(--space-4)');
  });

  it('applies alignment and wrap modifiers', () => {
    const { container } = render(
      <Stack align="center" justify="between" wrap>
        <span>A</span>
      </Stack>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className).toContain('ot-stack--align-center');
    expect(el.className).toContain('ot-stack--justify-between');
    expect(el.className).toContain('ot-stack--wrap');
  });
});
