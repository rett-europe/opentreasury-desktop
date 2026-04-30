// Unit tests for syncRoot classification utility (PR-A trial-readiness).

import { describe, it, expect } from 'vitest';
import { classifySyncRoot } from './syncRoot.js';

describe('classifySyncRoot', () => {
  it('classifies OneDrive for Business paths with subfolder', () => {
    expect(classifySyncRoot('C:\\Users\\Pedro\\OneDrive - Rett Europe\\OT')).toBe(
      'onedrive-business',
    );
    expect(classifySyncRoot('C:\\Users\\Alice\\OneDrive - Contoso Ltd\\Finance')).toBe(
      'onedrive-business',
    );
    // With spaces around the dash
    expect(classifySyncRoot('C:\\Users\\Bob\\OneDrive  -  Acme Corp\\Data')).toBe(
      'onedrive-business',
    );
    // Nested subfolders
    expect(classifySyncRoot('C:\\Users\\Pedro\\OneDrive - Rett Europe\\OT\\2024')).toBe(
      'onedrive-business',
    );
  });

  it('rejects OneDrive for Business root (no subfolder)', () => {
    // Root of OneDrive Business (no subfolder) — should be 'other' (blocked)
    expect(classifySyncRoot('C:\\Users\\Pedro\\OneDrive - Rett Europe')).toBe('other');
    expect(classifySyncRoot('C:\\Users\\Pedro\\OneDrive - Rett Europe\\')).toBe('other');
    expect(classifySyncRoot('C:\\Users\\Alice\\OneDrive - Contoso Ltd')).toBe('other');
  });

  it('classifies OneDrive Personal paths', () => {
    expect(classifySyncRoot('C:\\Users\\Pedro\\OneDrive\\OT')).toBe('onedrive-personal');
    expect(classifySyncRoot('C:\\Users\\Alice\\OneDrive\\Documents')).toBe('onedrive-personal');
    // Edge case: OneDrive at path end
    expect(classifySyncRoot('C:\\Users\\Bob\\OneDrive')).toBe('onedrive-personal');
  });

  it('classifies former SharePoint heuristic paths as "other" (strict allowlist)', () => {
    // SharePoint heuristic removed — these are now blocked unless under OneDrive Business
    // Pattern: Tenant \ ... - Library (was classified as SharePoint, now 'other')
    expect(classifySyncRoot('C:\\Users\\Pedro\\Rett Europe\\Finance - Documents\\OT')).toBe(
      'other',
    );
    // Pattern: TenantName - SiteName (was classified as SharePoint, now 'other')
    expect(classifySyncRoot('C:\\Users\\Alice\\Contoso - Finance Site\\Data')).toBe('other');
    // The vulnerability: user-created local folder with dash in name
    expect(classifySyncRoot('C:\\Users\\Pedro\\Treasury - Backup\\OT')).toBe('other');
  });

  it('classifies local and other paths as "other"', () => {
    // Desktop
    expect(classifySyncRoot('C:\\Users\\Pedro\\Desktop\\OT')).toBe('other');
    // Documents
    expect(classifySyncRoot('C:\\Users\\Pedro\\Documents\\OT')).toBe('other');
    // Downloads
    expect(classifySyncRoot('C:\\Users\\Pedro\\Downloads\\OT')).toBe('other');
    // USB drive
    expect(classifySyncRoot('D:\\Backup\\OT')).toBe('other');
    // Network share
    expect(classifySyncRoot('\\\\server\\share\\OT')).toBe('other');
    // Root of drive
    expect(classifySyncRoot('C:\\OT')).toBe('other');
    // c:\temp (Pedro's exact case from bug report)
    expect(classifySyncRoot('c:\\temp')).toBe('other');
  });

  it('handles edge cases gracefully', () => {
    // Empty path
    expect(classifySyncRoot('')).toBe('other');
    // Single segment
    expect(classifySyncRoot('C:\\')).toBe('other');
    // Malformed paths (but won't crash)
    expect(classifySyncRoot('not-a-real-path')).toBe('other');
  });

  it('is case-insensitive', () => {
    expect(classifySyncRoot('c:\\users\\pedro\\onedrive - rett europe\\ot')).toBe(
      'onedrive-business',
    );
    expect(classifySyncRoot('C:\\USERS\\PEDRO\\ONEDRIVE\\OT')).toBe('onedrive-personal');
  });

  it('handles forward slashes (cross-platform)', () => {
    expect(classifySyncRoot('/Users/pedro/OneDrive - Rett Europe/OT')).toBe('onedrive-business');
    expect(classifySyncRoot('/Users/pedro/OneDrive/OT')).toBe('onedrive-personal');
  });
});
