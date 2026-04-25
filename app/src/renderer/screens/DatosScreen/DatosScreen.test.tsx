// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { DatosScreen } from './DatosScreen.js';

// Mock ImportWizard — we only care about the navigation wiring on `onComplete`.
vi.mock('../../components/ImportWizard/index.js', () => ({
  ImportWizard: ({ onComplete }: { onComplete: () => void }) => (
    <button data-testid="mock-complete" onClick={onComplete}>
      complete
    </button>
  ),
}));

describe('DatosScreen', () => {
  it('navigates to movements after import-wizard completes', () => {
    const onImportComplete = vi.fn();
    const onNavigateToMovements = vi.fn();

    render(
      <I18nextProvider i18n={i18n}>
        <DatosScreen
          onImportComplete={onImportComplete}
          onNavigateToMovements={onNavigateToMovements}
        />
      </I18nextProvider>,
    );

    // Open the wizard.
    const openCta = screen.getAllByRole('button').find((b) => /import|importar/i.test(b.textContent ?? ''));
    expect(openCta).toBeDefined();
    fireEvent.click(openCta!);

    // Trigger onComplete on the (mocked) wizard.
    fireEvent.click(screen.getByTestId('mock-complete'));

    expect(onImportComplete).toHaveBeenCalledTimes(1);
    expect(onNavigateToMovements).toHaveBeenCalledTimes(1);
  });

  it('does not throw when onNavigateToMovements is omitted', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <DatosScreen />
      </I18nextProvider>,
    );

    const openCta = screen.getAllByRole('button').find((b) => /import|importar/i.test(b.textContent ?? ''));
    fireEvent.click(openCta!);

    expect(() => fireEvent.click(screen.getByTestId('mock-complete'))).not.toThrow();
  });
});
