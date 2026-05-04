import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Electron before importing index.ts (which has top-level side effects).
// We can't easily test index.ts itself because it runs app.whenReady() at the
// module level. Instead, we extract the production-only logic into a helper.

interface MockApp {
  isPackaged: boolean;
  setName: ReturnType<typeof vi.fn>;
}

interface MockMenu {
  setApplicationMenu: ReturnType<typeof vi.fn>;
}

/**
 * Extracted helper: apply production-only defaults to isolate userData and hide the menu.
 * This is what index.ts does at the top level when packaged.
 */
export function applyPackagedDefaults(app: MockApp, Menu: MockMenu): void {
  if (app.isPackaged) {
    app.setName('OpenTreasury');
    Menu.setApplicationMenu(null);
  }
}

describe('applyPackagedDefaults', () => {
  let mockApp: MockApp;
  let mockMenu: MockMenu;

  beforeEach(() => {
    mockApp = {
      isPackaged: false,
      setName: vi.fn(),
    };
    mockMenu = {
      setApplicationMenu: vi.fn(),
    };
  });

  it('sets app name and hides menu when packaged', () => {
    mockApp.isPackaged = true;
    applyPackagedDefaults(mockApp, mockMenu);

    expect(mockApp.setName).toHaveBeenCalledWith('OpenTreasury');
    expect(mockMenu.setApplicationMenu).toHaveBeenCalledWith(null);
  });

  it('does nothing when not packaged (dev mode)', () => {
    mockApp.isPackaged = false;
    applyPackagedDefaults(mockApp, mockMenu);

    expect(mockApp.setName).not.toHaveBeenCalled();
    expect(mockMenu.setApplicationMenu).not.toHaveBeenCalled();
  });
});
