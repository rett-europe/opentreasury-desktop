// Workspace IPC contract — encryption-at-rest setup, join, unlock, recovery (SPEC-026 v2).
//
// Defines the workspace lifecycle: detection (fresh | join | unlock | recovery | migration),
// fresh setup (create workspace + mnemonic generation), join (enroll device via mnemonic),
// unlock (silent via safeStorage), and recovery (re-wrap via mnemonic).
//
// Real implementations land in Morpheus's #305 / #310. This contract enables parallel UI work
// via mocked responses (see app/src/renderer/mocks/workspaceIpc.ts).

import { z } from 'zod';

// ============================================================================
// Workspace State Detection
// ============================================================================

export const IPC_WORKSPACE_DETECT = 'workspace:detect';

export const workspaceStateSchema = z.enum([
  'fresh', // No events.key, no events-*.ndjson — first-run setup (also returned
  //                   for folders containing only a stray legacy events.ndjson;
  //                   see hadLegacyFile on the detect response).
  'join', // events.key exists, this deviceId NOT in devices[]
  'unlock', // events.key exists, this deviceId in devices[], safeStorage works
  'recovery', // events.key exists, this deviceId in devices[], safeStorage fails
]);

export type WorkspaceState = z.infer<typeof workspaceStateSchema>;

export const workspaceDetectRequestSchema = z.object({
  /** Workspace folder path, or undefined to use current from device.json */
  folderPath: z.string().optional(),
});

export type WorkspaceDetectRequest = z.infer<typeof workspaceDetectRequestSchema>;

export const workspaceDetectResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    state: workspaceStateSchema,
    /** Current workspace folder path, if any */
    folderPath: z.string().optional(),
    /**
     * SPEC-026 cleanup — true when the folder contains a stray legacy
     * unencrypted `events.ndjson`. Only meaningful when `state === 'fresh'`;
     * the FreshSetupFlow footer surfaces a one-line hint when set.
     */
    hadLegacyFile: z.boolean().optional(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  }),
]);

export type WorkspaceDetectResponse = z.infer<typeof workspaceDetectResponseSchema>;

// ============================================================================
// Fresh Setup — Create Workspace + Generate Mnemonic
// ============================================================================

export const IPC_WORKSPACE_CREATE = 'workspace:create';

export const workspaceCreateRequestSchema = z.object({
  /** Chosen workspace folder path */
  folderPath: z.string(),
});

export type WorkspaceCreateRequest = z.infer<typeof workspaceCreateRequestSchema>;

export const workspaceCreateResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    /** 12-word BIP39 mnemonic for display + confirmation */
    mnemonic: z.string(),
    /** Opaque setup token, passed to confirmSetup after user confirms words */
    setupToken: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  }),
]);

export type WorkspaceCreateResponse = z.infer<typeof workspaceCreateResponseSchema>;

// ============================================================================
// Fresh Setup — Confirm Setup (3 challenge words)
// ============================================================================

export const IPC_WORKSPACE_CONFIRM_SETUP = 'workspace:confirmSetup';

export const workspaceConfirmSetupRequestSchema = z.object({
  /** Setup token from create response */
  setupToken: z.string(),
  /** Map of position (1-12) -> word, for 3 random challenge positions */
  confirmWords: z.record(z.string(), z.string()),
});

export type WorkspaceConfirmSetupRequest = z.infer<typeof workspaceConfirmSetupRequestSchema>;

// Event mirror schema for workspace setup completion
export const workspaceCreatedEventMirrorSchema = z.object({
  id: z.string(),
  type: z.literal('workspace.created'),
  timestamp: z.string(),
  workspaceId: z.string(),
});

export type WorkspaceCreatedEventMirror = z.infer<typeof workspaceCreatedEventMirrorSchema>;

export const workspaceConfirmSetupResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    event: workspaceCreatedEventMirrorSchema,
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  }),
]);

export type WorkspaceConfirmSetupResponse = z.infer<typeof workspaceConfirmSetupResponseSchema>;

// ============================================================================
// Join — Enroll Device via Mnemonic
// ============================================================================

export const IPC_WORKSPACE_ENROLL = 'workspace:enroll';

export const workspaceEnrollRequestSchema = z.object({
  /** Workspace folder path */
  folderPath: z.string(),
  /** 12-word BIP39 mnemonic */
  mnemonic: z.string(),
  /** Device label (optional, defaults to OS hostname) */
  deviceLabel: z.string().optional(),
});

export type WorkspaceEnrollRequest = z.infer<typeof workspaceEnrollRequestSchema>;

export const deviceEnrolledEventMirrorSchema = z.object({
  id: z.string(),
  type: z.literal('device.enrolled'),
  timestamp: z.string(),
  deviceId: z.string(),
  deviceLabel: z.string().optional(),
});

export type DeviceEnrolledEventMirror = z.infer<typeof deviceEnrolledEventMirrorSchema>;

export const workspaceEnrollResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    event: deviceEnrolledEventMirrorSchema,
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  }),
]);

export type WorkspaceEnrollResponse = z.infer<typeof workspaceEnrollResponseSchema>;

// ============================================================================
// Unlock — Silent (via safeStorage)
// ============================================================================

export const IPC_WORKSPACE_UNLOCK = 'workspace:unlock';

export const workspaceUnlockRequestSchema = z.object({}).optional();

export type WorkspaceUnlockRequest = z.infer<typeof workspaceUnlockRequestSchema>;

export const workspaceUnlockResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      /** If code is 'needs-recovery', trigger recovery flow */
      needsRecovery: z.boolean().optional(),
    }),
  }),
]);

export type WorkspaceUnlockResponse = z.infer<typeof workspaceUnlockResponseSchema>;

// ============================================================================
// Recovery — Re-wrap via Mnemonic
// ============================================================================

export const IPC_WORKSPACE_RECOVER = 'workspace:recover';

export const workspaceRecoverRequestSchema = z.object({
  /** 12-word BIP39 mnemonic */
  mnemonic: z.string(),
});

export type WorkspaceRecoverRequest = z.infer<typeof workspaceRecoverRequestSchema>;

export const deviceRecoveredEventMirrorSchema = z.object({
  id: z.string(),
  type: z.literal('device.recovered'),
  timestamp: z.string(),
  deviceId: z.string(),
});

export type DeviceRecoveredEventMirror = z.infer<typeof deviceRecoveredEventMirrorSchema>;

export const workspaceRecoverResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    event: deviceRecoveredEventMirrorSchema,
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
      field: z.string().optional(),
    }),
  }),
]);

export type WorkspaceRecoverResponse = z.infer<typeof workspaceRecoverResponseSchema>;

// ============================================================================
// Lock — Zeroize MK from in-memory session
// ============================================================================

export const IPC_WORKSPACE_LOCK = 'workspace:lock';

export const workspaceLockRequestSchema = z.object({}).optional();

export type WorkspaceLockRequest = z.infer<typeof workspaceLockRequestSchema>;

export const workspaceLockResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string(), message: z.string() }),
  }),
]);

export type WorkspaceLockResponse = z.infer<typeof workspaceLockResponseSchema>;
