// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MigrationScreen } from './MigrationScreen.js';

describe('MigrationScreen', () => {
  it('renders the migration heading', () => {
    render(<MigrationScreen folderPath="/my/workspace" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('migration');
  });

  it('shows the migrate-workspace command with the folder path pre-filled', () => {
    render(<MigrationScreen folderPath="/shared/treasury" />);
    expect(screen.getByText(/migrate-workspace\.mjs/)).toBeTruthy();
    // The folder path appears in both the command and the folder display
    const matches = screen.getAllByText(/\/shared\/treasury/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows a generic command placeholder when no folderPath is provided', () => {
    render(<MigrationScreen folderPath={undefined} />);
    expect(screen.getByText(/<folder>/)).toBeTruthy();
  });
});
