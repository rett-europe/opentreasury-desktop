// Organisation-profile API client — thin wrapper over
// window.opentreasury.orgProfile.* (SPEC-030 WI-4). Mirrors the other
// services/*Api.ts modules.

import type {
  OrgProfileGetResponse,
  OrgProfileSaveResponse,
  OrgProfileSetLogoResponse,
  OrgProfileRemoveLogoResponse,
  OrgProfileGetLogoResponse,
  OrgProfileEditable,
  OrgProfileSetLogoRequest,
} from '../../shared/ipc-contracts/org-profile.js';

export function getOrgProfile(): Promise<OrgProfileGetResponse> {
  return window.opentreasury.orgProfile.get();
}

export function saveOrgProfile(edits: OrgProfileEditable): Promise<OrgProfileSaveResponse> {
  return window.opentreasury.orgProfile.save(edits);
}

export function setOrgLogo(req: OrgProfileSetLogoRequest): Promise<OrgProfileSetLogoResponse> {
  return window.opentreasury.orgProfile.setLogo(req);
}

export function removeOrgLogo(): Promise<OrgProfileRemoveLogoResponse> {
  return window.opentreasury.orgProfile.removeLogo();
}

export function getOrgLogo(): Promise<OrgProfileGetLogoResponse> {
  return window.opentreasury.orgProfile.getLogo();
}
