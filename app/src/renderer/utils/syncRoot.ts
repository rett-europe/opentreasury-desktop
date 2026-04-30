// Sync root classification utility for trial-readiness PR-A.
//
// Classifies a folder path as OneDrive Business, SharePoint, OneDrive Personal,
// or local/other. Used by SettingsScreen to enforce the corp-folder requirement.

export type SyncRootKind = 'onedrive-business' | 'sharepoint' | 'onedrive-personal' | 'other';

/**
 * Classify a path as OneDrive Business, SharePoint, OneDrive Personal, or other.
 *
 * **Allowlist model (strict):** Only paths under OneDrive for Business sync roots
 * or verified SharePoint sync roots are allowed. Everything else is blocked.
 *
 * Detection rules (Windows-first; macOS later):
 *
 * 1. **OneDrive for Business:** path matches /OneDrive\s*-\s*[^/\\]+\/[^/\\]+/
 *    (case-insensitive). The "OneDrive - {Org}" pattern is the canonical sync-folder
 *    name created by OneDrive for Business. REQUIRES a subfolder beneath the org root
 *    to prevent users from selecting the entire corporate OneDrive as the data folder.
 *
 * 2. **SharePoint sync:** REMOVED in favor of strict allowlist. SharePoint libraries
 *    synced via OneDrive typically live under the OneDrive Business folder or a
 *    separate top-level folder. The old heuristic (detect " - " in folder names)
 *    was too permissive and leaked local folders like "Treasury - Backup".
 *
 *    Future improvement: Use Windows registry (HKCU\Software\Microsoft\OneDrive\Accounts\Business*)
 *    to enumerate actual sync roots. For now, require OneDrive Business path only.
 *
 * 3. **OneDrive Personal:** path matches /OneDrive(?:\/|$)/ without the " - " suffix.
 *    This is explicitly blocked (not corp storage).
 *
 * 4. Anything else → 'other' (local Desktop, Documents, USB, network shares, etc.)
 *
 * @param path - Absolute path to classify (Windows or POSIX)
 * @returns Classification result
 */
export function classifySyncRoot(path: string): SyncRootKind {
  // Normalize to forward slashes and lowercase for pattern matching
  const normalized = path.replace(/\\/g, '/').toLowerCase();

  // Rule 1: OneDrive for Business (has " - " after OneDrive) + REQUIRES SUBFOLDER
  // Pattern: /OneDrive - Org/Subfolder (at least one path segment after the org root)
  // Match: C:\Users\X\OneDrive - Org\Treasurer ✅
  // Reject: C:\Users\X\OneDrive - Org ❌
  // Reject: C:\Users\X\OneDrive - Org\ ❌ (trailing slash, still root)
  const businessMatch = /\/onedrive\s*-\s*[^/\\]+\/[^/\\]+/i.test(normalized);
  if (businessMatch) {
    return 'onedrive-business';
  }

  // Rule 3: OneDrive Personal (no " - " after OneDrive)
  const onedriveMatch = /\/onedrive(?:\/|$)/i.test(normalized);
  const hasDash = /\/onedrive\s*-\s*/i.test(normalized);
  if (onedriveMatch && !hasDash) {
    return 'onedrive-personal';
  }

  // Rule 2: SharePoint sync — REMOVED (heuristic was too permissive).
  // Any path that doesn't match OneDrive Business or OneDrive Personal is now
  // classified as 'other' and will be blocked by the corp-storage requirement.
  //
  // Future: Add registry-based detection for SharePoint sync roots if needed.

  // Default: local or other (BLOCKED by corp-storage requirement)
  return 'other';
}
