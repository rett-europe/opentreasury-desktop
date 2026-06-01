// @vitest-environment jsdom
// Issue #353 — Tests for the FormatPreferences context (persistence + fallback).
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FormatPreferencesProvider,
  useFormatPrefs,
  DATE_FORMAT_STORAGE_KEY,
  NUMBER_FORMAT_STORAGE_KEY,
} from './index.js';

function Probe(): JSX.Element {
  const { dateFormat, numberFormat, setDateFormat, setNumberFormat } = useFormatPrefs();
  return (
    <div>
      <span data-testid="df">{dateFormat}</span>
      <span data-testid="nf">{numberFormat}</span>
      <button onClick={() => setDateFormat('ISO')}>iso</button>
      <button onClick={() => setNumberFormat('eu')}>eu</button>
    </div>
  );
}

describe('FormatPreferencesProvider', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('falls back to en-derived defaults (MDY/us) with no stored preference', () => {
    render(
      <FormatPreferencesProvider>
        <Probe />
      </FormatPreferencesProvider>,
    );
    expect(screen.getByTestId('df').textContent).toBe('MDY');
    expect(screen.getByTestId('nf').textContent).toBe('us');
  });

  it('reads a previously stored preference on mount', () => {
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, 'DMY');
    localStorage.setItem(NUMBER_FORMAT_STORAGE_KEY, 'eu');
    render(
      <FormatPreferencesProvider>
        <Probe />
      </FormatPreferencesProvider>,
    );
    expect(screen.getByTestId('df').textContent).toBe('DMY');
    expect(screen.getByTestId('nf').textContent).toBe('eu');
  });

  it('persists an explicit change to localStorage and updates the value', () => {
    render(
      <FormatPreferencesProvider>
        <Probe />
      </FormatPreferencesProvider>,
    );
    fireEvent.click(screen.getByText('iso'));
    fireEvent.click(screen.getByText('eu'));
    expect(localStorage.getItem(DATE_FORMAT_STORAGE_KEY)).toBe('ISO');
    expect(localStorage.getItem(NUMBER_FORMAT_STORAGE_KEY)).toBe('eu');
    expect(screen.getByTestId('df').textContent).toBe('ISO');
    expect(screen.getByTestId('nf').textContent).toBe('eu');
  });

  it('ignores corrupt stored values and uses defaults', () => {
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, 'BOGUS');
    render(
      <FormatPreferencesProvider>
        <Probe />
      </FormatPreferencesProvider>,
    );
    expect(screen.getByTestId('df').textContent).toBe('MDY');
  });
});

describe('useFormatPrefs without a provider', () => {
  beforeEach(() => localStorage.clear());

  it('returns read-only language defaults and inert setters (no throw)', () => {
    render(<Probe />);
    expect(screen.getByTestId('df').textContent).toBe('MDY');
    expect(screen.getByTestId('nf').textContent).toBe('us');
    // Setter is a no-op without a provider — must not throw or persist.
    fireEvent.click(screen.getByText('iso'));
    expect(localStorage.getItem(DATE_FORMAT_STORAGE_KEY)).toBeNull();
    expect(screen.getByTestId('df').textContent).toBe('MDY');
  });
});
