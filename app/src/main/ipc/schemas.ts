// IPC payload schemas (ADR-001 C6, C13 / ADR-002 §4.1).
// Every IPC channel defined in src/shared/ipc-contracts/ gets a Zod validator here.
// Handlers dispatch by channel name; unknown channels throw.
//
// Scaffold only — no real channels yet.
import { z } from 'zod';

// TODO: add real IPC contract schemas as features land. Example shape:
//   export const TxCreateRequest = z.object({ accountId: z.string().ulid(), amount: z.number() });
//   export type TxCreateRequest = z.infer<typeof TxCreateRequest>;

export const PingRequest = z.object({}).strict();
export type PingRequest = z.infer<typeof PingRequest>;

export const PingResponse = z.object({ ok: z.literal(true), ts: z.number().int() }).strict();
export type PingResponse = z.infer<typeof PingResponse>;

// Channel registry — every channel MUST appear here with both request and response schemas.
// ADR-001 C13: no dynamic dispatch, no eval.
export const IpcSchemas = {
  'app:ping': { request: PingRequest, response: PingResponse },
} as const;

export type IpcChannel = keyof typeof IpcSchemas;
