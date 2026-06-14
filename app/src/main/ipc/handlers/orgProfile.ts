// org-profile:* IPC handlers — SPEC-030 WI-4.
//
// get / save (text fields) / set-logo / remove-logo / get-logo for the
// organisation profile that feeds the Financial Report header + footer. All
// state lives in userData (org-profile.json + org-assets/) — never the
// encrypted treasury store (Switch's guarantee).

import { app } from 'electron';
import {
  orgProfileGetRequestSchema,
  type OrgProfileGetResponse,
  orgProfileSaveRequestSchema,
  type OrgProfileSaveResponse,
  orgProfileSetLogoRequestSchema,
  type OrgProfileSetLogoResponse,
  orgProfileRemoveLogoRequestSchema,
  type OrgProfileRemoveLogoResponse,
  orgProfileGetLogoRequestSchema,
  type OrgProfileGetLogoResponse,
} from '../../../shared/ipc-contracts/org-profile.js';
import {
  saveOrgProfile,
  applyEditableFields,
  writeLogoAsset,
  removeLogoAssets,
  readLogoDataUrl,
} from '../../orgProfile.js';
import { getOrgProfile, setOrgProfile } from '../../bootstrap.js';

export async function handleOrgProfileGet(raw: unknown): Promise<OrgProfileGetResponse> {
  orgProfileGetRequestSchema.parse(raw);
  return { ok: true, profile: getOrgProfile() };
}

export async function handleOrgProfileSave(raw: unknown): Promise<OrgProfileSaveResponse> {
  const parsed = orgProfileSaveRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
    };
  }

  try {
    const next = applyEditableFields(getOrgProfile(), parsed.data);
    await saveOrgProfile(app.getPath('userData'), next);
    setOrgProfile(next);
    return { ok: true, profile: next };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'WRITE_FAILED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function handleOrgProfileSetLogo(raw: unknown): Promise<OrgProfileSetLogoResponse> {
  const parsed = orgProfileSetLogoRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_INVALID',
        message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      },
    };
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(parsed.data.dataBase64, 'base64');
  } catch {
    return { ok: false, error: { code: 'INVALID_IMAGE', message: 'Invalid base64 payload' } };
  }

  try {
    const userDataDir = app.getPath('userData');
    const result = await writeLogoAsset(
      userDataDir,
      parsed.data.fileName,
      parsed.data.mimeType,
      buf,
    );
    if (!result.ok) {
      return { ok: false, error: { code: result.code, message: result.message } };
    }

    const next = { ...getOrgProfile(), logo: result.metadata, updatedAt: new Date().toISOString() };
    await saveOrgProfile(userDataDir, next);
    setOrgProfile(next);
    return { ok: true, profile: next };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'WRITE_FAILED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function handleOrgProfileRemoveLogo(
  raw: unknown,
): Promise<OrgProfileRemoveLogoResponse> {
  orgProfileRemoveLogoRequestSchema.parse(raw);
  try {
    const userDataDir = app.getPath('userData');
    await removeLogoAssets(userDataDir);
    const next = { ...getOrgProfile(), logo: null, updatedAt: new Date().toISOString() };
    await saveOrgProfile(userDataDir, next);
    setOrgProfile(next);
    return { ok: true, profile: next };
  } catch (err) {
    return {
      ok: false,
      error: { code: 'WRITE_FAILED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

export async function handleOrgProfileGetLogo(raw: unknown): Promise<OrgProfileGetLogoResponse> {
  orgProfileGetLogoRequestSchema.parse(raw);
  const dataUrl = await readLogoDataUrl(app.getPath('userData'), getOrgProfile().logo);
  return { ok: true, dataUrl };
}
