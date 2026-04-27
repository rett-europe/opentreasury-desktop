// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { AppShell } from './AppShell.js';

const STORAGE_KEY = 'opentreasury.sidebar.collapsed';

/**
 * Minimal `matchMedia` stub for jsdom. The runtime cares about `(max-width:
 * 960px)` only — we expose a controllable `setNarrow()` to flip viewport
 * state and dispatch the change event the component subscribes to.
 */
type MqlListener = (event: MediaQueryListEvent) => void;

interface ControllableMql {
  setNarrow: (narrow: boolean) => void;
}

function installMatchMediaStub(): ControllableMql {
  let narrow = false;
  const listeners = new Set<MqlListener>();

  const mql: MediaQueryList = {
    get matches() {
      return narrow;
    },
    media: '(max-width: 960px)',
    onchange: null,
    addEventListener: ((_type: string, listener: MqlListener) => {
      listeners.add(listener);
    }) as MediaQueryList['addEventListener'],
    removeEventListener: ((_type: string, listener: MqlListener) => {
      listeners.delete(listener);
    }) as MediaQueryList['removeEventListener'],
    addListener: (listener) => {
      if (listener) listeners.add(listener);
    },
    removeListener: (listener) => {
      if (listener) listeners.delete(listener);
    },
    dispatchEvent: () => true,
  };

  window.matchMedia = vi.fn().mockReturnValue(mql);

  return {
    setNarrow: (next: boolean) => {
      narrow = next;
      const event = { matches: next, media: '(max-width: 960px)' } as MediaQueryListEvent;
      listeners.forEach((l) => {
        l(event);
      });
    },
  };
}

function renderShell(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <AppShell currentRoute="panel" onNavigate={() => undefined}>
        <div>main</div>
      </AppShell>
    </I18nextProvider>,
  );
}

describe('AppShell — sidebar collapse/expand toggle (issue #95)', () => {
  let mql: ControllableMql;

  beforeEach(() => {
    localStorage.clear();
    mql = installMatchMediaStub();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts expanded by default and flips collapsed on click', () => {
    renderShell();
    const brand = screen.getByRole('button', { name: /collapse navigation|contraer/i });
    expect(brand.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(brand);

    // After click, the same button now advertises the inverse action.
    const collapsed = screen.getByRole('button', { name: /expand navigation|expandir/i });
    expect(collapsed.getAttribute('aria-expanded')).toBe('false');
  });

  it('persists the preference to localStorage and restores it on remount', () => {
    const { unmount } = renderShell();
    fireEvent.click(screen.getByRole('button', { name: /collapse navigation|contraer/i }));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
    unmount();

    renderShell();
    const restored = screen.getByRole('button', { name: /expand navigation|expandir/i });
    expect(restored.getAttribute('aria-expanded')).toBe('false');
  });

  it('reports collapsed state truthfully at ≤960px even when preference is "expanded"', () => {
    // Preference says "expanded" (default). CSS auto-collapses at narrow widths.
    renderShell();
    const brand = screen.getByRole('button', { name: /collapse navigation|contraer/i });
    expect(brand.getAttribute('aria-expanded')).toBe('true');

    // Simulate the viewport crossing the breakpoint.
    act(() => {
      mql.setNarrow(true);
    });

    const narrowBrand = screen.getByRole('button', { name: /expand navigation|expandir/i });
    // ARIA must reflect what the user sees — sidebar is visually collapsed.
    expect(narrowBrand.getAttribute('aria-expanded')).toBe('false');
    // Toggle is meaningless at narrow widths (CSS owns the state) — disabled.
    expect((narrowBrand as HTMLButtonElement).disabled).toBe(true);
  });

  it('cross-tab sync ignores key removal (does not silently expand)', () => {
    // Start with a stored "collapsed" preference.
    localStorage.setItem(STORAGE_KEY, 'true');
    renderShell();
    expect(
      screen
        .getByRole('button', { name: /expand navigation|expandir/i })
        .getAttribute('aria-expanded'),
    ).toBe('false');

    // Another tab clears the key. `StorageEvent.newValue` is `null`.
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          oldValue: 'true',
          newValue: null,
        }),
      );
    });

    // State is preserved — we did NOT silently expand.
    expect(
      screen
        .getByRole('button', { name: /expand navigation|expandir/i })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('cross-tab sync applies "true"/"false" updates from other windows', () => {
    renderShell();
    expect(
      screen
        .getByRole('button', { name: /collapse navigation|contraer/i })
        .getAttribute('aria-expanded'),
    ).toBe('true');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          oldValue: null,
          newValue: 'true',
        }),
      );
    });

    expect(
      screen
        .getByRole('button', { name: /expand navigation|expandir/i })
        .getAttribute('aria-expanded'),
    ).toBe('false');
  });
});
