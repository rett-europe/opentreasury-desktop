// SPEC-028 WI-5 (#362) — Minimal DER (ASN.1) reader/writer.
//
// Scope: just enough of X.690 DER to BUILD an RFC-3161 TimeStampReq and to
// PARSE a TimeStampResp / CMS SignedData / TSTInfo / X.509 extensions. It is
// intentionally small and dependency-free; all *cryptographic* operations
// (signature verification, certificate chain math) are done by Node's built-in
// `crypto`, not here. This module only moves bytes around.
//
// Design notes:
//   - Parsing is strict: definite-length only (BER indefinite length is
//     rejected), lengths must be minimally encoded, and a node's declared
//     length must not exceed its parent. Malformed input throws `DerError`.
//   - Tag handling is limited to the classes/forms RFC-3161 + CMS need:
//     UNIVERSAL primitives/constructed and context-specific [n] tags. That is
//     sufficient for the grammar we verify.

export class DerError extends Error {
  constructor(message: string) {
    super(`DER: ${message}`);
    this.name = 'DerError';
  }
}

// ---- Universal tag numbers we reference -----------------------------------
export const TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x30, // constructed
  SET: 0x31, // constructed
  PRINTABLE_STRING: 0x13,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
} as const;

/** A parsed TLV node over a shared buffer (no copies; offsets into `buf`). */
export interface DerNode {
  /** Full first tag byte (class + constructed bit + number for low tags). */
  readonly tag: number;
  /** Tag class: 0 universal, 1 application, 2 context, 3 private. */
  readonly cls: number;
  /** True if the constructed bit (0x20) is set. */
  readonly constructed: boolean;
  /** Tag number (low-tag-number form only — sufficient here). */
  readonly tagNumber: number;
  /** Offset of the first tag byte in `buf`. */
  readonly start: number;
  /** Offset just past the end of the value (start of the next sibling). */
  readonly end: number;
  /** Offset of the first content (value) byte. */
  readonly contentStart: number;
  /** Offset just past the last content byte. */
  readonly contentEnd: number;
  /** The underlying buffer. */
  readonly buf: Uint8Array;
}

/** The raw value bytes of a node (a view, not a copy). */
export function content(node: DerNode): Uint8Array {
  return node.buf.subarray(node.contentStart, node.contentEnd);
}

/** The full TLV bytes of a node (a view, not a copy). */
export function tlv(node: DerNode): Uint8Array {
  return node.buf.subarray(node.start, node.end);
}

/**
 * Parse exactly one TLV starting at `offset`. Returns the node; the caller
 * recurses into constructed nodes by parsing within [contentStart, contentEnd).
 */
export function parseTlv(buf: Uint8Array, offset: number, limit = buf.length): DerNode {
  if (offset >= limit) throw new DerError('unexpected end of input (tag)');
  const tag = buf[offset]!;
  const cls = (tag & 0xc0) >> 6;
  const constructed = (tag & 0x20) !== 0;
  const tagNumber = tag & 0x1f;
  if (tagNumber === 0x1f) throw new DerError('high-tag-number form not supported');

  let p = offset + 1;
  if (p >= limit) throw new DerError('unexpected end of input (length)');
  const first = buf[p]!;
  p += 1;
  let length: number;
  if ((first & 0x80) === 0) {
    length = first; // short form
  } else {
    const numBytes = first & 0x7f;
    if (numBytes === 0) throw new DerError('indefinite length not allowed in DER');
    if (numBytes > 4) throw new DerError('length too large');
    if (p + numBytes > limit) throw new DerError('unexpected end of input (long length)');
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = length * 256 + buf[p + i]!;
    }
    // Minimal-encoding check: long form must be necessary and must not have a
    // leading zero byte.
    if (length < 0x80) throw new DerError('non-minimal length encoding');
    if (buf[p] === 0x00) throw new DerError('non-minimal length encoding (leading zero)');
    p += numBytes;
  }

  const contentStart = p;
  const contentEnd = p + length;
  if (contentEnd > limit) throw new DerError('content length exceeds parent/buffer');

  return {
    tag,
    cls,
    constructed,
    tagNumber,
    start: offset,
    end: contentEnd,
    contentStart,
    contentEnd,
    buf,
  };
}

/**
 * Parse exactly one TLV that MUST consume the ENTIRE buffer. Rejects trailing
 * bytes after the top-level value — a strict-DER requirement that closes the
 * "valid structure + appended garbage" class of attacks where extra bytes ride
 * along after an otherwise-well-formed (and signed) structure.
 */
export function parseSingleTlv(buf: Uint8Array, what = 'value'): DerNode {
  const node = parseTlv(buf, 0);
  if (node.end !== buf.length) {
    throw new DerError(`trailing bytes after ${what} (${buf.length - node.end} extra)`);
  }
  return node;
}

/** Parse all sibling TLVs in [start, end). */
export function parseSiblings(buf: Uint8Array, start: number, end: number): DerNode[] {
  const out: DerNode[] = [];
  let p = start;
  while (p < end) {
    const node = parseTlv(buf, p, end);
    out.push(node);
    p = node.end;
  }
  return out;
}

/** Parse the immediate children of a constructed node. */
export function children(node: DerNode): DerNode[] {
  if (!node.constructed) throw new DerError('cannot read children of a primitive');
  return parseSiblings(node.buf, node.contentStart, node.contentEnd);
}

/** Assert a node is a universal SEQUENCE; return its children. */
export function expectSequence(node: DerNode): DerNode[] {
  if (node.tag !== TAG.SEQUENCE) {
    throw new DerError(`expected SEQUENCE, got tag 0x${node.tag.toString(16)}`);
  }
  return children(node);
}

/** Assert a node is a universal SET; return its children. */
export function expectSet(node: DerNode): DerNode[] {
  if (node.tag !== TAG.SET) throw new DerError(`expected SET, got tag 0x${node.tag.toString(16)}`);
  return children(node);
}

/** Read an OID node as dotted-decimal string. */
export function readOid(node: DerNode): string {
  if (node.tag !== TAG.OID) throw new DerError(`expected OID, got tag 0x${node.tag.toString(16)}`);
  const b = content(node);
  if (b.length === 0) throw new DerError('empty OID');
  const parts: number[] = [];
  const first = b[0]!;
  parts.push(Math.floor(first / 40));
  parts.push(first % 40);
  let value = 0;
  let started = false;
  for (let i = 1; i < b.length; i++) {
    const byte = b[i]!;
    value = value * 128 + (byte & 0x7f);
    started = true;
    if ((byte & 0x80) === 0) {
      parts.push(value);
      value = 0;
      started = false;
    }
  }
  if (started) throw new DerError('truncated OID');
  return parts.join('.');
}

/** Read an INTEGER node as a non-negative bigint (rejects negative values). */
export function readUintBig(node: DerNode): bigint {
  if (node.tag !== TAG.INTEGER) {
    throw new DerError(`expected INTEGER, got tag 0x${node.tag.toString(16)}`);
  }
  const b = content(node);
  if (b.length === 0) throw new DerError('empty INTEGER');
  if ((b[0]! & 0x80) !== 0) throw new DerError('negative INTEGER not allowed here');
  let v = 0n;
  for (const byte of b) v = (v << 8n) | BigInt(byte);
  return v;
}

/** Read an INTEGER node as a safe JS number (throws if too large). */
export function readUint(node: DerNode): number {
  const v = readUintBig(node);
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new DerError('INTEGER too large for number');
  return Number(v);
}

/** Read a BOOLEAN node. */
export function readBoolean(node: DerNode): boolean {
  if (node.tag !== TAG.BOOLEAN) throw new DerError('expected BOOLEAN');
  const b = content(node);
  if (b.length !== 1) throw new DerError('malformed BOOLEAN');
  return b[0] !== 0x00;
}

/**
 * Parse a GeneralizedTime (the form RFC-3161 `genTime` uses) into a Date.
 * Accepts `YYYYMMDDHHMMSS[.fff]Z`. Strict about the trailing `Z` (UTC).
 */
export function readGeneralizedTime(node: DerNode): Date {
  if (node.tag !== TAG.GENERALIZED_TIME) throw new DerError('expected GeneralizedTime');
  const s = Buffer.from(content(node)).toString('ascii');
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?Z$/u.exec(s);
  if (m === null) throw new DerError(`malformed GeneralizedTime: ${s}`);
  const [, y, mo, d, h, mi, se, frac] = m;
  const ms = frac === undefined ? 0 : Number((frac + '000').slice(0, 3));
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se), ms);
  if (Number.isNaN(t)) throw new DerError(`invalid GeneralizedTime: ${s}`);
  const dt = new Date(t);
  // Reject calendar-invalid dates that `Date.UTC` silently NORMALISES (e.g.
  // 20260231… → Mar 3): require every parsed field to round-trip exactly, so a
  // malformed TSA time can never be accepted as a different (valid) instant.
  if (
    dt.getUTCFullYear() !== Number(y) ||
    dt.getUTCMonth() !== Number(mo) - 1 ||
    dt.getUTCDate() !== Number(d) ||
    dt.getUTCHours() !== Number(h) ||
    dt.getUTCMinutes() !== Number(mi) ||
    dt.getUTCSeconds() !== Number(se)
  ) {
    throw new DerError(`invalid GeneralizedTime: ${s}`);
  }
  return dt;
}

// ---- Encoding --------------------------------------------------------------

function encodeLength(len: number): Uint8Array {
  if (len < 0x80) return Uint8Array.of(len);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n = Math.floor(n / 256);
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

/** Encode a TLV from a tag byte and already-encoded content. */
export function encodeTlv(tag: number, contentBytes: Uint8Array): Uint8Array {
  const len = encodeLength(contentBytes.length);
  const out = new Uint8Array(1 + len.length + contentBytes.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(contentBytes, 1 + len.length);
  return out;
}

export function encodeSequence(...items: Uint8Array[]): Uint8Array {
  return encodeTlv(TAG.SEQUENCE, concat(items));
}

/** Encode a non-negative integer (bigint) as a DER INTEGER. */
export function encodeUintBig(value: bigint): Uint8Array {
  if (value < 0n) throw new DerError('cannot encode negative INTEGER');
  let hex = value.toString(16);
  if (hex.length % 2 === 1) hex = '0' + hex;
  let bytes = Buffer.from(hex, 'hex');
  if (bytes.length === 0) bytes = Buffer.from([0x00]);
  // Prepend 0x00 if the high bit is set (so it is not read as negative).
  if ((bytes[0]! & 0x80) !== 0) bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
  return encodeTlv(TAG.INTEGER, bytes);
}

export function encodeOctetString(bytes: Uint8Array): Uint8Array {
  return encodeTlv(TAG.OCTET_STRING, bytes);
}

export function encodeNull(): Uint8Array {
  return Uint8Array.of(TAG.NULL, 0x00);
}

export function encodeBoolean(value: boolean): Uint8Array {
  return encodeTlv(TAG.BOOLEAN, Uint8Array.of(value ? 0xff : 0x00));
}

/** Encode a dotted-decimal OID string as a DER OBJECT IDENTIFIER. */
export function encodeOid(oid: string): Uint8Array {
  const parts = oid.split('.').map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isInteger(n) || n < 0)) {
    throw new DerError(`invalid OID: ${oid}`);
  }
  const body: number[] = [40 * parts[0]! + parts[1]!];
  const encodeBase128 = (n: number): number[] => {
    const stack: number[] = [n & 0x7f];
    let v = Math.floor(n / 128);
    while (v > 0) {
      stack.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    return stack;
  };
  for (let i = 2; i < parts.length; i++) body.push(...encodeBase128(parts[i]!));
  return encodeTlv(TAG.OID, Uint8Array.from(body));
}

export function concat(items: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const it of items) total += it.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const it of items) {
    out.set(it, p);
    p += it.length;
  }
  return out;
}
