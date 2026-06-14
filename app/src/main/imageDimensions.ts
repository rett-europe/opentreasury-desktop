// Minimal intrinsic-dimension reader for the org logo (SPEC-030 WI-4).
//
// We deliberately avoid a heavy image dependency: the org logo only accepts
// PNG, JPEG and SVG (shared/ipc-contracts/org-profile.ts → LOGO_MIME_TYPES),
// so a tiny header parser covers every supported format. Used by the logo
// validator to enforce dimension + aspect-ratio bounds (Mouse risk #1).

export interface ImageDimensions {
  width: number | null;
  height: number | null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Read PNG dimensions from the IHDR chunk (bytes 16–23). */
function readPng(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Read JPEG dimensions by scanning for the first SOF marker. */
function readJpeg(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    // Every marker starts with 0xFF.
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1];
    if (marker === undefined) break;
    // SOF0..SOF15 carry frame dimensions (excluding DHT/JPG/DAC: C4, C8, CC).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // Segment: FF Cx | len(2) | precision(1) | height(2) | width(2)
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }
    // Standalone markers (no length payload): RSTn (D0–D7), SOI, EOI.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    // Otherwise skip this segment using its 16-bit length.
    const segLen = buf.readUInt16BE(offset + 2);
    if (segLen < 2) return null;
    offset += 2 + segLen;
  }
  return null;
}

/**
 * Read SVG dimensions from width/height or viewBox attributes. SVG is vector,
 * so a missing intrinsic size is acceptable — returns nulls in that case.
 */
function readSvg(buf: Buffer): ImageDimensions {
  const head = buf.toString('utf-8', 0, Math.min(buf.length, 4096));
  const svgTag = /<svg[^>]*>/i.exec(head)?.[0] ?? '';

  const parseLen = (raw: string | undefined): number | null => {
    if (!raw) return null;
    const m = /([\d.]+)/.exec(raw);
    const captured = m?.[1];
    if (!captured) return null;
    const n = Number.parseFloat(captured);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  const width = parseLen(/\bwidth\s*=\s*["']([^"']+)["']/i.exec(svgTag)?.[1]);
  const height = parseLen(/\bheight\s*=\s*["']([^"']+)["']/i.exec(svgTag)?.[1]);
  if (width && height) return { width, height };

  const viewBox = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(svgTag)?.[1];
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    const vbWidth = parts[2];
    const vbHeight = parts[3];
    if (
      parts.length === 4 &&
      vbWidth !== undefined &&
      vbHeight !== undefined &&
      vbWidth > 0 &&
      vbHeight > 0
    ) {
      return { width: Math.round(vbWidth), height: Math.round(vbHeight) };
    }
  }
  return { width: null, height: null };
}

/**
 * Determine intrinsic dimensions for a supported logo buffer.
 * Returns null when the bytes don't match the declared format (corrupt/spoofed).
 * For SVG, returns `{ width: null, height: null }` when no size is declared.
 */
export function readImageDimensions(buf: Buffer, mimeType: string): ImageDimensions | null {
  switch (mimeType) {
    case 'image/png':
      return readPng(buf);
    case 'image/jpeg':
      return readJpeg(buf);
    case 'image/svg+xml':
      return readSvg(buf);
    default:
      return null;
  }
}
