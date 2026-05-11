// Mock workspace IPC adapter — renderer-only mocked responses for parallel UI work.
//
// Returns canned responses for workspace IPC methods while Morpheus builds the real
// main-process handlers. Toggle via VITE_MOCK_WORKSPACE env var during dev.
//
// This mock lives in renderer/, not shared/, because it depends on `generateMnemonic`
// from the bip39 package which is fine in renderer but crypto primitives (libsodium)
// are NOT — those stay in main-process.

import { generateMnemonic, validateMnemonic } from 'bip39';
import type {
  WorkspaceDetectRequest,
  WorkspaceDetectResponse,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceConfirmSetupRequest,
  WorkspaceConfirmSetupResponse,
  WorkspaceEnrollRequest,
  WorkspaceEnrollResponse,
  WorkspaceUnlockResponse,
  WorkspaceRecoverRequest,
  WorkspaceRecoverResponse,
  WorkspaceState,
} from '../../shared/ipc-contracts/workspace';

// In-memory mock state
interface MockState {
  state: WorkspaceState;
  folderPath: string | null;
  mnemonic: string | null;
  setupToken: string | null;
  isUnlocked: boolean;
  failedAttempts: number;
}

const mockState: MockState = {
  state: 'fresh',
  folderPath: null,
  mnemonic: null,
  setupToken: null,
  isUnlocked: false,
  failedAttempts: 0,
};

// Generate a mock ULID-like ID
function mockUlid(): string {
  return `01HZ${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
}

// Generate a mock ISO timestamp
function mockTimestamp(): string {
  return new Date().toISOString();
}

export const mockWorkspaceIpc = {
  detect: async (req: WorkspaceDetectRequest): Promise<WorkspaceDetectResponse> => {
    // Simulate detection logic based on mock state
    return {
      ok: true,
      state: mockState.state,
      folderPath: req.folderPath || mockState.folderPath || undefined,
    };
  },

  create: async (req: WorkspaceCreateRequest): Promise<WorkspaceCreateResponse> => {
    // Generate a fresh 12-word BIP39 mnemonic
    const mnemonic = generateMnemonic(128); // 128 bits = 12 words
    const setupToken = mockUlid();

    // Store in mock state
    mockState.mnemonic = mnemonic;
    mockState.setupToken = setupToken;
    mockState.folderPath = req.folderPath;

    return {
      ok: true,
      mnemonic,
      setupToken,
    };
  },

  confirmSetup: async (
    req: WorkspaceConfirmSetupRequest,
  ): Promise<WorkspaceConfirmSetupResponse> => {
    // Validate setup token
    if (req.setupToken !== mockState.setupToken) {
      return {
        ok: false,
        error: {
          code: 'invalid_setup_token',
          message: 'Setup token is invalid or expired.',
        },
      };
    }

    // Validate confirmation words
    if (!mockState.mnemonic) {
      return {
        ok: false,
        error: {
          code: 'no_mnemonic',
          message: 'No mnemonic in memory. Please restart setup.',
        },
      };
    }

    const words = mockState.mnemonic.split(' ');
    for (const [posStr, word] of Object.entries(req.confirmWords)) {
      const pos = parseInt(posStr, 10);
      if (words[pos - 1] !== word) {
        return {
          ok: false,
          error: {
            code: 'confirmation_mismatch',
            message: `Word at position ${pos} does not match.`,
            field: `word${pos}`,
          },
        };
      }
    }

    // Success — update state
    mockState.state = 'unlock';
    mockState.isUnlocked = true;
    mockState.setupToken = null; // Clear token after use

    return {
      ok: true,
      event: {
        id: mockUlid(),
        type: 'workspace.created',
        timestamp: mockTimestamp(),
        workspaceId: mockUlid(),
      },
    };
  },

  enroll: async (req: WorkspaceEnrollRequest): Promise<WorkspaceEnrollResponse> => {
    // Validate mnemonic format
    if (!validateMnemonic(req.mnemonic)) {
      return {
        ok: false,
        error: {
          code: 'invalid_mnemonic',
          message: 'The recovery code you entered is not valid. Please check and try again.',
          field: 'mnemonic',
        },
      };
    }

    // Simulate checking against stored mnemonic (in real impl, derive key and decrypt)
    if (req.mnemonic !== mockState.mnemonic) {
      mockState.failedAttempts += 1;
      return {
        ok: false,
        error: {
          code: 'mnemonic_mismatch',
          message: "That recovery code doesn't match. Please check and try again.",
          field: 'mnemonic',
        },
      };
    }

    // Success — enroll device
    mockState.state = 'unlock';
    mockState.isUnlocked = true;
    mockState.failedAttempts = 0;

    return {
      ok: true,
      event: {
        id: mockUlid(),
        type: 'device.enrolled',
        timestamp: mockTimestamp(),
        deviceId: mockUlid(),
        deviceLabel: req.deviceLabel,
      },
    };
  },

  unlock: async (): Promise<WorkspaceUnlockResponse> => {
    // Simulate silent unlock
    if (mockState.state === 'unlock' && mockState.isUnlocked) {
      return { ok: true };
    }

    // Simulate needs-recovery
    if (mockState.state === 'recovery') {
      return {
        ok: false,
        error: {
          code: 'needs-recovery',
          message: 'Unable to unlock automatically. Please enter your recovery code.',
          needsRecovery: true,
        },
      };
    }

    return {
      ok: false,
      error: {
        code: 'not_enrolled',
        message: 'This device is not enrolled in the workspace.',
      },
    };
  },

  recover: async (req: WorkspaceRecoverRequest): Promise<WorkspaceRecoverResponse> => {
    // Validate mnemonic format
    if (!validateMnemonic(req.mnemonic)) {
      return {
        ok: false,
        error: {
          code: 'invalid_mnemonic',
          message: 'The recovery code you entered is not valid. Please check and try again.',
          field: 'mnemonic',
        },
      };
    }

    // Simulate checking against stored mnemonic
    if (req.mnemonic !== mockState.mnemonic) {
      mockState.failedAttempts += 1;
      return {
        ok: false,
        error: {
          code: 'mnemonic_mismatch',
          message: "That recovery code doesn't match. Please check and try again.",
          field: 'mnemonic',
        },
      };
    }

    // Success — recover
    mockState.state = 'unlock';
    mockState.isUnlocked = true;
    mockState.failedAttempts = 0;

    return {
      ok: true,
      event: {
        id: mockUlid(),
        type: 'device.recovered',
        timestamp: mockTimestamp(),
        deviceId: mockUlid(),
      },
    };
  },

  // Helper for tests: reset mock state
  __reset: () => {
    mockState.state = 'fresh';
    mockState.folderPath = null;
    mockState.mnemonic = null;
    mockState.setupToken = null;
    mockState.isUnlocked = false;
    mockState.failedAttempts = 0;
  },

  // Helper for tests: set state directly
  __setState: (state: Partial<MockState>) => {
    Object.assign(mockState, state);
  },

  // Helper for tests: get current failed attempts count
  __getFailedAttempts: () => mockState.failedAttempts,
};
