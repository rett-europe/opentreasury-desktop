// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { MigrationScreen } from './MigrationScreen.js';

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

function renderWithI18n(folderPath: string | undefined) {
  return render(
    <I18nextProvider i18n={i18n}>
      <MigrationScreen folderPath={folderPath} />
    </I18nextProvider>,
  );
}

describe('MigrationScreen', () => {
  it('renders the migration heading', () => {
    renderWithI18n('/my/workspace');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('migration');
  });

  it('shows the migrate-workspace command with the folder path pre-filled', () => {
    renderWithI18n('/shared/treasury');
    expect(screen.getByText(/migrate-workspace\.mjs/)).toBeTruthy();
    const matches = screen.getAllByText(/\/shared\/treasury/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it('shows a generic command placeholder when no folderPath is provided', () => {
    renderWithI18n(undefined);
    expect(screen.getByText(/<folder>/)).toBeTruthy();
  });
});
