// Organisation-profile store + logo asset persistence — SPEC-030 WI-4.
//
// The org profile feeds the Financial Report header (FR3) and signature footer
// (FR9). It is a NON-SENSITIVE record stored in userData/org-profile.json, and
// the logo binary lives in userData/org-assets/. Neither ever enters the
// encrypted treasury store (Switch's guarantee; SPEC-030 §6.3, §8).
//
// Atomic writes (tmp → fsync → rename) mirror the user `profile.ts` pattern so
// a crash mid-write can't corrupt the file.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  orgProfileSchema,
  type OrgProfile,
  type OrgProfileEditable,
  type OrgProfileViewModel,
  type LogoMetadata,
  type LogoMimeType,
  type LogoErrorCode,
  LOGO_MAX_BYTES,
  LOGO_MIN_DIMENSION,
  LOGO_MAX_DIMENSION,
  LOGO_MIN_ASPECT,
  LOGO_MAX_ASPECT,
  LOGO_MIME_TYPES,
} from '../shared/ipc-contracts/org-profile.js';
import { readImageDimensions } from './imageDimensions.js';

const ORG_PROFILE_FILENAME = 'org-profile.json';
const ORG_ASSETS_DIRNAME = 'org-assets';
const LOGO_BASENAME = 'logo';

/** Map a supported MIME type to the on-disk logo file extension. */
function extForMime(mimeType: LogoMimeType): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/svg+xml':
      return 'svg';
  }
}

function orgAssetsDir(userDataDir: string): string {
  return path.join(userDataDir, ORG_ASSETS_DIRNAME);
}

function logoAbsolutePath(userDataDir: string, mimeType: LogoMimeType): string {
  return path.join(orgAssetsDir(userDataDir), `${LOGO_BASENAME}.${extForMime(mimeType)}`);
}

export function createDefaultOrgProfile(): OrgProfile {
  return {
    version: 1,
    orgName: '',
    legalRegistrationLine: '',
    address: '',
    contactEmail: '',
    treasurer: { name: '', role: '', place: '' },
    auditor: { name: '', role: '', place: '' },
    logo: null,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Load org-profile.json. Returns a default (empty) profile when the file is
 * missing or fails validation — the settings form recreates it on first save.
 * Throws only on unexpected I/O errors.
 */
export async function loadOrgProfile(userDataDir: string): Promise<OrgProfile> {
  const filePath = path.join(userDataDir, ORG_PROFILE_FILENAME);
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`[org-profile] Invalid JSON in ${ORG_PROFILE_FILENAME} (${filePath})`);
      return createDefaultOrgProfile();
    }
    const result = orgProfileSchema.safeParse(parsed);
    if (!result.success) {
      // eslint-disable-next-line no-console
      console.warn(`[org-profile] Invalid ${ORG_PROFILE_FILENAME}: ${result.error.message}`);
      return createDefaultOrgProfile();
    }
    return result.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefaultOrgProfile();
    }
    throw err;
  }
}

/** Atomically write org-profile.json (tmp → fsync → rename). */
export async function saveOrgProfile(userDataDir: string, profile: OrgProfile): Promise<void> {
  orgProfileSchema.parse(profile);

  const filePath = path.join(userDataDir, ORG_PROFILE_FILENAME);
  const tmpPath = `${filePath}.tmp`;
  const content = JSON.stringify(profile, null, 2);

  await fs.writeFile(tmpPath, content, 'utf-8');
  const fh = await fs.open(tmpPath, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, filePath);
}

/**
 * Apply editable text fields onto an existing profile, preserving the logo and
 * stamping updatedAt. Pure — the caller persists the result.
 */
export function applyEditableFields(current: OrgProfile, edits: OrgProfileEditable): OrgProfile {
  return {
    ...current,
    orgName: edits.orgName,
    legalRegistrationLine: edits.legalRegistrationLine,
    address: edits.address,
    contactEmail: edits.contactEmail,
    treasurer: edits.treasurer,
    auditor: edits.auditor,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Logo validation + asset I/O
// ---------------------------------------------------------------------------

export type LogoValidationResult =
  | { ok: true; width: number | null; height: number | null }
  | { ok: false; code: LogoErrorCode; message: string };

/**
 * Validate raw logo bytes against the SPEC-030 constraints (type, size,
 * dimensions, aspect ratio). Pure + dependency-free, so it is unit-tested in
 * isolation. SVG without an intrinsic size passes the dimension/aspect checks.
 */
export function validateLogoBytes(buf: Buffer, mimeType: string): LogoValidationResult {
  if (!(LOGO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return { ok: false, code: 'UNSUPPORTED_TYPE', message: `Unsupported logo type: ${mimeType}` };
  }
  if (buf.length === 0) {
    return { ok: false, code: 'INVALID_IMAGE', message: 'Empty logo file' };
  }
  if (buf.length > LOGO_MAX_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `Logo exceeds ${LOGO_MAX_BYTES} bytes (got ${buf.length})`,
    };
  }

  const dims = readImageDimensions(buf, mimeType);
  if (dims === null) {
    return {
      ok: false,
      code: 'INVALID_IMAGE',
      message: 'Logo bytes do not match the declared image format',
    };
  }

  const { width, height } = dims;
  // Raster formats must report concrete dimensions; only SVG may omit them.
  if ((width === null || height === null) && mimeType !== 'image/svg+xml') {
    return { ok: false, code: 'INVALID_IMAGE', message: 'Could not read logo dimensions' };
  }

  if (width !== null && height !== null) {
    if (
      width < LOGO_MIN_DIMENSION ||
      height < LOGO_MIN_DIMENSION ||
      width > LOGO_MAX_DIMENSION ||
      height > LOGO_MAX_DIMENSION
    ) {
      return {
        ok: false,
        code: 'DIMENSIONS_OUT_OF_RANGE',
        message: `Logo dimensions ${width}×${height}px must be within ${LOGO_MIN_DIMENSION}–${LOGO_MAX_DIMENSION}px`,
      };
    }
    const aspect = width / height;
    if (aspect < LOGO_MIN_ASPECT || aspect > LOGO_MAX_ASPECT) {
      return {
        ok: false,
        code: 'ASPECT_OUT_OF_RANGE',
        message: `Logo aspect ratio ${aspect.toFixed(2)} must be within ${LOGO_MIN_ASPECT}–${LOGO_MAX_ASPECT}`,
      };
    }
  }

  return { ok: true, width, height };
}

/**
 * Validate + persist a logo asset under userData/org-assets/. Removes any
 * previously-stored logo (possibly a different extension) first. Returns the
 * new metadata, or a validation error. NEVER touches the encrypted dataset.
 */
export async function writeLogoAsset(
  userDataDir: string,
  fileName: string,
  mimeType: LogoMimeType,
  buf: Buffer,
): Promise<
  { ok: true; metadata: LogoMetadata } | { ok: false; code: LogoErrorCode; message: string }
> {
  const validation = validateLogoBytes(buf, mimeType);
  if (!validation.ok) {
    return validation;
  }

  // Clear stale assets of every supported extension before writing the new one.
  await removeLogoAssets(userDataDir);

  const dir = orgAssetsDir(userDataDir);
  await fs.mkdir(dir, { recursive: true });
  const target = logoAbsolutePath(userDataDir, mimeType);
  const tmpPath = `${target}.tmp`;

  await fs.writeFile(tmpPath, buf);
  const fh = await fs.open(tmpPath, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, target);

  const metadata: LogoMetadata = {
    fileName,
    mimeType,
    width: validation.width,
    height: validation.height,
    byteSize: buf.length,
    storedAt: new Date().toISOString(),
  };
  return { ok: true, metadata };
}

/** Delete every stored logo asset (all supported extensions). Idempotent. */
export async function removeLogoAssets(userDataDir: string): Promise<void> {
  await Promise.all(
    LOGO_MIME_TYPES.map(async (mime) => {
      const p = logoAbsolutePath(userDataDir, mime);
      try {
        await fs.unlink(p);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }),
  );
}

/** Resolve the absolute path of the stored logo, or null when none/missing. */
export async function resolveLogoPath(
  userDataDir: string,
  logo: LogoMetadata | null,
): Promise<string | null> {
  if (!logo) return null;
  const p = logoAbsolutePath(userDataDir, logo.mimeType);
  try {
    await fs.access(p);
    return p;
  } catch {
    return null;
  }
}

/** Read the stored logo as a data: URL for renderer preview (or null). */
export async function readLogoDataUrl(
  userDataDir: string,
  logo: LogoMetadata | null,
): Promise<string | null> {
  const p = await resolveLogoPath(userDataDir, logo);
  if (!p || !logo) return null;
  const buf = await fs.readFile(p);
  return `data:${logo.mimeType};base64,${buf.toString('base64')}`;
}

/**
 * Typed accessor other WIs (e.g. the report builder in main) read to obtain the
 * org-profile view-model. The logo carries an absolute on-disk path under
 * userData — outside the encrypted store.
 */
export async function getOrgProfileViewModel(
  userDataDir: string,
  profile: OrgProfile,
): Promise<OrgProfileViewModel> {
  const logoPath = await resolveLogoPath(userDataDir, profile.logo);
  return {
    orgName: profile.orgName,
    legalRegistrationLine: profile.legalRegistrationLine,
    address: profile.address,
    contactEmail: profile.contactEmail,
    treasurer: profile.treasurer,
    auditor: profile.auditor,
    logo:
      logoPath && profile.logo
        ? {
            absolutePath: logoPath,
            mimeType: profile.logo.mimeType,
            width: profile.logo.width,
            height: profile.logo.height,
          }
        : null,
  };
}
