// SPEC-028 WI-5 (#362) — Timestamp provider abstraction + RFC-3161 HTTP impl.
//
// The provider is the ONLY networked piece. It is deliberately thin: build the
// DER request, POST it, pull the token out of the response, and return either
// the raw token bytes or a *typed* error. It NEVER throws — the timestamp
// service treats every outcome as best-effort and off the write path.
//
// Verification of the returned token is NOT done here (that is `verify.ts` /
// `rfc3161.verifyTimeStampToken`, which needs the anchor + trust roots). The
// provider only transports bytes.

import { buildTimeStampRequest, parseTimeStampResp } from './rfc3161.js';

export interface TimestampRequest {
  readonly alg: 'sha256';
  /** The message-imprint digest to be timestamped. */
  readonly hash: Uint8Array;
  /** Random nonce echoed back in the token (replay/substitution defence). */
  readonly nonce: Uint8Array;
}

export type TimestampProviderError =
  | 'unreachable' // DNS/connection failure, offline
  | 'timeout' // request exceeded the bounded deadline
  | 'http-error' // non-2xx HTTP status
  | 'rejected' // TSA returned a non-granted PKIStatus
  | 'malformed'; // response could not be parsed / no token

export type TimestampResult =
  | { readonly ok: true; readonly tokenDer: Uint8Array }
  | { readonly ok: false; readonly error: TimestampProviderError; readonly detail?: string };

export interface TimestampProvider {
  readonly id: string;
  readonly kind: 'rfc3161';
  /** Bundled trust-root ids (resolved by `roots.ts` during verification). */
  readonly trustRootIds: readonly string[];
  /** Request a timestamp token. Resolves to a token or a typed error; never throws. */
  requestTimestamp(req: TimestampRequest): Promise<TimestampResult>;
}

export interface Rfc3161HttpProviderConfig {
  readonly id: string;
  readonly url: string;
  readonly trustRootIds: readonly string[];
  /** Bounded request deadline in ms (default 15s). */
  readonly timeoutMs?: number;
  /** Optional requested TSA policy OID. */
  readonly reqPolicyOid?: string;
  /** Injected fetch (tests); defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const RFC3161_QUERY = 'application/timestamp-query';
const RFC3161_REPLY = 'application/timestamp-reply';
/** Reject absurd response bodies before parsing (defensive). */
const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * RFC-3161 provider over HTTP. Uses a bounded `AbortController` deadline so a
 * slow/hung TSA can never wedge the caller; the timestamp service additionally
 * never awaits this on any write/unlock/lock path.
 */
export class Rfc3161HttpProvider implements TimestampProvider {
  readonly kind = 'rfc3161' as const;
  readonly id: string;
  readonly trustRootIds: readonly string[];
  private readonly url: string;
  private readonly timeoutMs: number;
  private readonly reqPolicyOid: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(config: Rfc3161HttpProviderConfig) {
    this.id = config.id;
    this.url = config.url;
    this.trustRootIds = config.trustRootIds;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.reqPolicyOid = config.reqPolicyOid;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async requestTimestamp(req: TimestampRequest): Promise<TimestampResult> {
    let body: Uint8Array;
    try {
      body = buildTimeStampRequest({
        hash: req.hash,
        nonce: req.nonce,
        certReq: true,
        ...(this.reqPolicyOid === undefined ? {} : { reqPolicyOid: this.reqPolicyOid }),
      });
    } catch (err) {
      return { ok: false, error: 'malformed', detail: errMsg(err) };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.url, {
        method: 'POST',
        headers: {
          'content-type': RFC3161_QUERY,
          accept: RFC3161_REPLY,
        },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        return { ok: false, error: 'http-error', detail: `status ${res.status}` };
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_RESPONSE_BYTES) {
        return { ok: false, error: 'malformed', detail: `size ${buf.length}` };
      }

      let parsed;
      try {
        parsed = parseTimeStampResp(buf);
      } catch (err) {
        return { ok: false, error: 'malformed', detail: errMsg(err) };
      }

      if (!parsed.granted) {
        return {
          ok: false,
          error: 'rejected',
          detail: parsed.statusText ?? `status ${parsed.status}`,
        };
      }
      if (parsed.tokenDer === null) {
        return { ok: false, error: 'malformed', detail: 'granted but no token' };
      }
      return { ok: true, tokenDer: parsed.tokenDer };
    } catch (err) {
      if (isAbortError(err)) return { ok: false, error: 'timeout' };
      return { ok: false, error: 'unreachable', detail: errMsg(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
