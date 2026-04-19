// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Text } from './Text.js';

describe('Text', () => {
  it('renders children', () => {
    render(<Text>Hello</Text>);
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('uses the default tag for the variant', () => {
    render(<Text variant="h1">Title</Text>);
    const el = screen.getByText('Title');
    expect(el.tagName).toBe('H1');
  });

  it('applies the variant class', () => {
    render(<Text variant="caption">Note</Text>);
    const el = screen.getByText('Note');
    expect(el.className).toContain('ot-text--caption');
  });

  it('applies the tabular-nums class when tabular=true', () => {
    render(<Text tabular>1234</Text>);
    const el = screen.getByText('1234');
    expect(el.className).toContain('ot-tnum');
  });

  it('allows tag override via `as`', () => {
    render(
      <Text as="label" variant="body">
        Label
      </Text>,
    );
    const el = screen.getByText('Label');
    expect(el.tagName).toBe('LABEL');
  });
});
