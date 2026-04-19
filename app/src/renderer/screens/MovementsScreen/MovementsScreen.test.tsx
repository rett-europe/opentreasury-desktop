// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <MovementsScreen />
    </I18nextProvider>,
  );
}

describe('MovementsScreen', () => {
  it('renders empty-on-open with a date range picker (UX-003 PR1)', () => {
    renderWithI18n();
    // Heading is present
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    // Picker radiogroup is present
    expect(screen.getByRole('radiogroup', { name: /date range presets/i })).toBeDefined();
    // No data table yet
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('does NOT show the New Transaction CTA until a range is selected', () => {
    renderWithI18n();
    // CTA is absent before any range is picked
    const ctas = screen.queryAllByRole('button');
    const ctaLabels = ctas.map((b) => b.textContent ?? '');
    expect(ctaLabels.some((label) => label.includes('Nuevo') || label.includes('New'))).toBe(false);
  });
});
