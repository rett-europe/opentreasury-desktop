// Tests for orgProfile.ts — SPEC-030 WI-4 (organisation profile + logo).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadOrgProfile,
  saveOrgProfile,
  createDefaultOrgProfile,
  applyEditableFields,
  validateLogoBytes,
  writeLogoAsset,
  removeLogoAssets,
  resolveLogoPath,
  getOrgProfileViewModel,
} from './orgProfile.js';
import { orgProfileSchema, LOGO_MAX_BYTES } from '../shared/ipc-contracts/org-profile.js';

function makePng(width: number, height: number, padBytes = 0): Buffer {
  const buf = Buffer.alloc(33 + padBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('orgProfile.ts', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `ot-org-profile-${Date.now()}-${Math.random()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('createDefaultOrgProfile', () => {
    it('produces a schema-valid empty profile', () => {
      const p = createDefaultOrgProfile();
      expect(orgProfileSchema.safeParse(p).success).toBe(true);
      expect(p.orgName).toBe('');
      expect(p.logo).toBeNull();
      expect(p.treasurer).toEqual({ name: '', role: '', place: '' });
    });
  });

  describe('load/save round-trip', () => {
    it('returns the default profile when the file is missing', async () => {
      const p = await loadOrgProfile(testDir);
      expect(p.orgName).toBe('');
      expect(p.logo).toBeNull();
    });

    it('persists and reloads editable fields', async () => {
      const base = createDefaultOrgProfile();
      const next = applyEditableFields(base, {
        orgName: 'Rett Syndrome Europe',
        legalRegistrationLine: 'Association sans but lucratif — RCS Luxembourg F1819',
        address: 'Rue de Test 1\n1000 Luxembourg',
        contactEmail: 'treasurer@example.org',
        treasurer: { name: 'Pedro Rocha', role: 'Treasurer RSE', place: 'Spain' },
        auditor: { name: 'Bahadir Dinler', role: 'Auditor', place: 'Türkiye' },
      });
      await saveOrgProfile(testDir, next);

      const reloaded = await loadOrgProfile(testDir);
      expect(reloaded.orgName).toBe('Rett Syndrome Europe');
      expect(reloaded.address).toContain('Luxembourg');
      expect(reloaded.contactEmail).toBe('treasurer@example.org');
      expect(reloaded.treasurer.name).toBe('Pedro Rocha');
      expect(reloaded.auditor.place).toBe('Türkiye');
    });

    it('falls back to default on corrupt JSON', async () => {
      await fs.writeFile(path.join(testDir, 'org-profile.json'), '{ not json', 'utf-8');
      const p = await loadOrgProfile(testDir);
      expect(p.orgName).toBe('');
    });
  });

  describe('validateLogoBytes', () => {
    it('accepts a well-formed PNG within bounds', () => {
      const res = validateLogoBytes(makePng(320, 120), 'image/png');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.width).toBe(320);
        expect(res.height).toBe(120);
      }
    });

    it('rejects unsupported types', () => {
      const res = validateLogoBytes(Buffer.from('GIF89a'), 'image/gif');
      expect(res).toMatchObject({ ok: false, code: 'UNSUPPORTED_TYPE' });
    });

    it('rejects oversized files', () => {
      const big = makePng(100, 100, LOGO_MAX_BYTES + 1);
      const res = validateLogoBytes(big, 'image/png');
      expect(res).toMatchObject({ ok: false, code: 'TOO_LARGE' });
    });

    it('rejects bytes that do not match the declared format', () => {
      const res = validateLogoBytes(Buffer.from('totally not a png'), 'image/png');
      expect(res).toMatchObject({ ok: false, code: 'INVALID_IMAGE' });
    });

    it('rejects out-of-range dimensions', () => {
      const res = validateLogoBytes(makePng(5000, 100), 'image/png');
      expect(res).toMatchObject({ ok: false, code: 'DIMENSIONS_OUT_OF_RANGE' });
    });

    it('rejects extreme aspect ratios', () => {
      const res = validateLogoBytes(makePng(1000, 50), 'image/png');
      expect(res).toMatchObject({ ok: false, code: 'ASPECT_OUT_OF_RANGE' });
    });

    it('accepts an SVG without intrinsic dimensions', () => {
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
      const res = validateLogoBytes(svg, 'image/svg+xml');
      expect(res.ok).toBe(true);
    });
  });

  describe('writeLogoAsset / removeLogoAssets / view-model', () => {
    it('writes the asset under org-assets and records metadata', async () => {
      const res = await writeLogoAsset(testDir, 'logo.png', 'image/png', makePng(300, 120));
      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.metadata.fileName).toBe('logo.png');
      expect(res.metadata.width).toBe(300);

      const stored = path.join(testDir, 'org-assets', 'logo.png');
      await expect(fs.access(stored)).resolves.toBeUndefined();
    });

    it('replaces a previously stored logo of a different type', async () => {
      await writeLogoAsset(testDir, 'a.png', 'image/png', makePng(300, 120));
      const svg = Buffer.from(
        '<svg width="200" height="80" xmlns="http://www.w3.org/2000/svg"></svg>',
      );
      const res = await writeLogoAsset(testDir, 'b.svg', 'image/svg+xml', svg);
      expect(res.ok).toBe(true);

      // The old PNG must be gone, only the SVG remains.
      await expect(fs.access(path.join(testDir, 'org-assets', 'logo.png'))).rejects.toThrow();
      await expect(
        fs.access(path.join(testDir, 'org-assets', 'logo.svg')),
      ).resolves.toBeUndefined();
    });

    it('rejects invalid bytes without writing', async () => {
      const res = await writeLogoAsset(testDir, 'bad.png', 'image/png', Buffer.from('nope'));
      expect(res.ok).toBe(false);
      await expect(fs.access(path.join(testDir, 'org-assets', 'logo.png'))).rejects.toThrow();
    });

    it('removeLogoAssets is idempotent', async () => {
      await writeLogoAsset(testDir, 'a.png', 'image/png', makePng(300, 120));
      await removeLogoAssets(testDir);
      await removeLogoAssets(testDir); // no throw second time
      await expect(fs.access(path.join(testDir, 'org-assets', 'logo.png'))).rejects.toThrow();
    });

    it('view-model resolves an absolute logo path outside the dataset', async () => {
      const write = await writeLogoAsset(testDir, 'a.png', 'image/png', makePng(300, 120));
      expect(write.ok).toBe(true);
      if (!write.ok) return;

      const profile = { ...createDefaultOrgProfile(), orgName: 'RSE', logo: write.metadata };
      const vm = await getOrgProfileViewModel(testDir, profile);
      expect(vm.orgName).toBe('RSE');
      expect(vm.logo).not.toBeNull();
      expect(vm.logo?.absolutePath).toBe(path.join(testDir, 'org-assets', 'logo.png'));
      expect(path.isAbsolute(vm.logo!.absolutePath)).toBe(true);
    });

    it('view-model logo is null when the asset is missing on disk', async () => {
      const profile = {
        ...createDefaultOrgProfile(),
        logo: {
          fileName: 'ghost.png',
          mimeType: 'image/png' as const,
          width: 100,
          height: 100,
          byteSize: 10,
          storedAt: new Date().toISOString(),
        },
      };
      expect(await resolveLogoPath(testDir, profile.logo)).toBeNull();
      const vm = await getOrgProfileViewModel(testDir, profile);
      expect(vm.logo).toBeNull();
    });
  });
});
