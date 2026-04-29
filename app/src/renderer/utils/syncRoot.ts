// Sync root classification utility for trial-readiness PR-A.
//
// Classifies a folder path as OneDrive Business, SharePoint, OneDrive Personal,
// or local/other. Used by SettingsScreen to enforce the corp-folder requirement.

export type SyncRootKind = 'onedrive-business' | 'sharepoint' | 'onedrive-personal' | 'other';

/**
 * Classify a path as OneDrive Business, SharePoint, OneDrive Personal, or other.
 *
 * Detection rules (Windows-first; macOS later):
 *
 * 1. **OneDrive for Business:** path matches /OneDrive\s*-\s*[^/\\]+/ (case-insensitive).
 *    The "OneDrive - {Org}" pattern is the canonical sync-folder name created by
 *    OneDrive for Business.
 *
 * 2. **SharePoint sync:** path lives under a folder created by OneDrive sync of a
 *    SharePoint document library. Two common patterns:
 *    - <UserProfile>\<Tenant>\... - <Library> (e.g. C:\Users\Pedro\Contoso\Finance - Documents\...)
 *    - <UserProfile>\<TenantName> - <SiteName>\... (older sync-client layout)
 *    Heuristic: any path under %USERPROFILE% whose first or second segment contains
 *    " - " AND is NOT a known non-sync folder (Desktop, Documents, Downloads, Pictures,
 *    Videos, Music, OneDrive itself without org).
 *
 * 3. **OneDrive Personal:** path matches /OneDrive(?:\/|$)/ without the " - " suffix.
 *
 * 4. Anything else → 'other' (local Desktop, Documents, USB, etc.)
 *
 * @param path - Absolute path to classify (Windows or POSIX)
 * @returns Classification result
 */
export function classifySyncRoot(path: string): SyncRootKind {
  // Normalize to forward slashes and lowercase for pattern matching
  const normalized = path.replace(/\\/g, '/').toLowerCase();

  // Rule 1: OneDrive for Business (has " - " after OneDrive)
  if (/\/onedrive\s*-\s*[^/]+/i.test(normalized)) {
    return 'onedrive-business';
  }

  // Rule 3: OneDrive Personal (no " - " after OneDrive)
  const onedriveMatch = /\/onedrive(?:\/|$)/i.test(normalized);
  const businessMatch = /\/onedrive\s*-\s*/i.test(normalized);
  if (onedriveMatch && !businessMatch) {
    return 'onedrive-personal';
  }

  // Rule 2: SharePoint sync heuristic
  // Extract path segments (split by / and filter empties)
  const segments = normalized.split('/').filter((s) => s.length > 0);

  // Known non-sync folders that live under user profile
  const knownNonSyncFolders = new Set([
    'desktop',
    'documents',
    'downloads',
    'pictures',
    'videos',
    'music',
    'appdata',
    'onedrive', // OneDrive without org suffix (already handled above)
  ]);

  // Look for " - " pattern in first or second segment after user profile
  // Typical structure: C: / Users / Pedro / {Tenant or TenantName - SiteName} / ...
  // We check segments starting from index 3 (after C:, Users, Username)
  for (let i = 3; i < Math.min(segments.length, 5); i++) {
    const segment = segments[i];
    if (!segment) continue;

    // Skip known non-sync folders
    if (knownNonSyncFolders.has(segment.toLowerCase())) continue;

    // Check if this segment contains " - " (SharePoint pattern)
    if (segment.includes(' - ')) {
      return 'sharepoint';
    }
  }

  // Default: local or other
  return 'other';
}
