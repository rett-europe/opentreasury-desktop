// Tests for the org-profile IPC contract schemas — SPEC-030 WI-4.

import { describe, it, expect } from 'vitest';
import {
  orgProfileSchema,
  orgProfileEditableSchema,
  orgProfileSetLogoRequestSchema,
  contactEmailSchema,
  logoMetadataSchema,
  signatorySchema,
} from './org-profile.js';

describe('org-profile contract', () => {
  describe('contactEmailSchema', () => {
    it('accepts an empty string (unset)', () => {
      expect(contactEmailSchema.safeParse('').success).toBe(true);
    });
    it('accepts a valid email', () => {
      expect(contactEmailSchema.safeParse('a@b.org').success).toBe(true);
    });
    it('rejects a malformed email', () => {
      expect(contactEmailSchema.safeParse('not-an-email').success).toBe(false);
    });
  });

  describe('signatorySchema', () => {
    it('defaults all fields to empty strings', () => {
      const parsed = signatorySchema.parse({});
      expect(parsed).toEqual({ name: '', role: '', place: '' });
    });
    it('rejects over-long names', () => {
      expect(signatorySchema.safeParse({ name: 'x'.repeat(121) }).success).toBe(false);
    });
  });

  describe('orgProfileSchema', () => {
    it('applies defaults for a minimal object', () => {
      const parsed = orgProfileSchema.parse({ updatedAt: new Date().toISOString() });
      expect(parsed.version).toBe(1);
      expect(parsed.orgName).toBe('');
      expect(parsed.logo).toBeNull();
      expect(parsed.treasurer).toEqual({ name: '', role: '', place: '' });
    });

    it('rejects an invalid contact email', () => {
      const res = orgProfileSchema.safeParse({
        updatedAt: new Date().toISOString(),
        contactEmail: 'bad',
      });
      expect(res.success).toBe(false);
    });
  });

  describe('orgProfileEditableSchema', () => {
    it('requires the editable fields (no defaults)', () => {
      expect(orgProfileEditableSchema.safeParse({}).success).toBe(false);
    });
    it('accepts a fully-specified editable payload', () => {
      const res = orgProfileEditableSchema.safeParse({
        orgName: 'RSE',
        legalRegistrationLine: 'ASBL',
        address: 'Somewhere',
        contactEmail: '',
        treasurer: { name: 'P', role: 'T', place: 'ES' },
        auditor: { name: 'B', role: 'A', place: 'TR' },
      });
      expect(res.success).toBe(true);
    });
  });

  describe('logoMetadataSchema', () => {
    it('allows null dimensions (SVG without intrinsic size)', () => {
      const res = logoMetadataSchema.safeParse({
        fileName: 'l.svg',
        mimeType: 'image/svg+xml',
        width: null,
        height: null,
        byteSize: 100,
        storedAt: new Date().toISOString(),
      });
      expect(res.success).toBe(true);
    });
    it('rejects an unsupported mime type', () => {
      const res = logoMetadataSchema.safeParse({
        fileName: 'l.gif',
        mimeType: 'image/gif',
        width: 10,
        height: 10,
        byteSize: 10,
        storedAt: new Date().toISOString(),
      });
      expect(res.success).toBe(false);
    });
  });

  describe('orgProfileSetLogoRequestSchema', () => {
    it('requires a non-empty base64 payload and supported type', () => {
      expect(
        orgProfileSetLogoRequestSchema.safeParse({
          fileName: 'l.png',
          mimeType: 'image/png',
          dataBase64: 'AAAA',
        }).success,
      ).toBe(true);
      expect(
        orgProfileSetLogoRequestSchema.safeParse({
          fileName: 'l.png',
          mimeType: 'image/png',
          dataBase64: '',
        }).success,
      ).toBe(false);
    });
  });
});
