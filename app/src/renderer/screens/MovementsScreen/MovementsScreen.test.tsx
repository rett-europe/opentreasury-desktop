// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  it('renders the prototype-parity filter bar on mount', async () => {
    renderWithI18n();
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    // Type chip group is present.
    expect(screen.getByRole('tablist')).toBeDefined();
    // "All" chip is active by default.
    const allChip = screen.getByRole('tab', { name: /todos|all/i });
    expect(allChip.getAttribute('aria-selected')).toBe('true');
  });

  it('shows the New Transaction CTA in the page header', async () => {
    renderWithI18n();
    // Wait for mock load to flip the disabled state off (200 ms round-trip).
    await waitFor(() => {
      const btn = screen.getAllByRole('button').find((b) => /nuevo|new/i.test(b.textContent ?? ''));
      expect(btn).toBeDefined();
    });
  });

  it('loads all mock transactions on mount (no date picker)', async () => {
    renderWithI18n();
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });
  });
});
