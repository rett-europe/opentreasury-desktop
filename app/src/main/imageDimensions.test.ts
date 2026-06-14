// Tests for imageDimensions.ts — SPEC-030 WI-4 logo dimension reader.

import { describe, it, expect } from 'vitest';
import { readImageDimensions } from './imageDimensions.js';

function makePng(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  // PNG signature
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR length
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function makeJpeg(width: number, height: number): Buffer {
  const head = Buffer.from([
    0xff,
    0xd8, // SOI
    0xff,
    0xc0, // SOF0
    0x00,
    0x11, // segment length
    0x08, // precision
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
  ]);
  return Buffer.concat([head, Buffer.alloc(8)]);
}

describe('readImageDimensions', () => {
  it('reads PNG dimensions from IHDR', () => {
    expect(readImageDimensions(makePng(320, 120), 'image/png')).toEqual({
      width: 320,
      height: 120,
    });
  });

  it('reads JPEG dimensions from the SOF marker', () => {
    expect(readImageDimensions(makeJpeg(640, 480), 'image/jpeg')).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('reads SVG dimensions from width/height attributes', () => {
    const svg = Buffer.from(
      '<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg"></svg>',
    );
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: 200, height: 80 });
  });

  it('reads SVG dimensions from viewBox when width/height are absent', () => {
    const svg = Buffer.from('<svg viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: 300, height: 150 });
  });

  it('returns nulls for an SVG without intrinsic size', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(readImageDimensions(svg, 'image/svg+xml')).toEqual({ width: null, height: null });
  });

  it('returns null when PNG bytes do not match the signature', () => {
    expect(readImageDimensions(Buffer.from('not a png'), 'image/png')).toBeNull();
  });

  it('returns null for unsupported mime types', () => {
    expect(readImageDimensions(makePng(10, 10), 'image/gif')).toBeNull();
  });
});
