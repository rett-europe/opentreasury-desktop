// Organisation-profile IPC contract — SPEC-030 WI-4 (Financial Report org settings).
//
// Carries the organisation details that feed the Financial Report's header
// (FR3) and signature footer (FR9): org name, legal registration line, address,
// contact email, and two signatory blocks (treasurer + external auditor).
//
// The org profile is a NON-SENSITIVE branding/identity record. It is persisted
// in userData/org-profile.json (mirroring the user `profile.json` pattern) and
// the logo binary lives in userData/org-assets/ — it NEVER enters the encrypted
// treasury store (Switch's no-encrypted-store guarantee; SPEC-030 §6.3, §8).
//
// Every channel is Zod-validated at the IPC boundary (R12, C13).

import { z } from 'zod';

export const IPC_ORG_PROFILE_GET = 'org-profile:get';
export const IPC_ORG_PROFILE_SAVE = 'org-profile:save';
export const IPC_ORG_PROFILE_SET_LOGO = 'org-profile:set-logo';
export const IPC_ORG_PROFILE_REMOVE_LOGO = 'org-profile:remove-logo';
export const IPC_ORG_PROFILE_GET_LOGO = 'org-profile:get-logo';

// ---------------------------------------------------------------------------
// Logo constraints (Mouse design-risk #1: unconstrained aspect ratio).
// Documented recommendation: horizontal, ≥2:1, transparent PNG/SVG.
// ---------------------------------------------------------------------------

/** Accepted logo MIME types. SVG is vector (dimension/aspect checks are skipped). */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'] as const;
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number];

/** Hard cap on the stored logo file size (1 MiB). */
export const LOGO_MAX_BYTES = 1_048_576;
/** Minimum / maximum intrinsic pixel dimension for raster logos. */
export const LOGO_MIN_DIMENSION = 16;
export const LOGO_MAX_DIMENSION = 2000;
/** Aspect-ratio (width / height) bounds — reject extreme slivers. */
export const LOGO_MIN_ASPECT = 0.2;
export const LOGO_MAX_ASPECT = 8;

export const logoMimeTypeSchema = z.enum(LOGO_MIME_TYPES);

/** Metadata stored alongside the org profile describing the persisted logo asset. */
export const logoMetadataSchema = z.object({
  fileName: z.string().min(1).max(255), // original file name, for display
  mimeType: logoMimeTypeSchema,
  width: z.number().int().positive().nullable(), // null for SVG without intrinsic size
  height: z.number().int().positive().nullable(),
  byteSize: z.number().int().nonnegative(),
  storedAt: z.string().datetime(), // ISO 8601 UTC
});

export type LogoMetadata = z.infer<typeof logoMetadataSchema>;

// ---------------------------------------------------------------------------
// Signatory block (treasurer + external auditor). All fields optional/empty —
// the report screen allows at-generation overrides later (FR3/FR9).
// ---------------------------------------------------------------------------

export const signatorySchema = z.object({
  name: z.string().max(120).default(''),
  role: z.string().max(120).default(''),
  place: z.string().max(120).default(''),
});

export type Signatory = z.infer<typeof signatorySchema>;

/** Contact email: either empty (unset) or a valid address. */
export const contactEmailSchema = z.union([z.literal(''), z.string().email().max(254)]);

// ---------------------------------------------------------------------------
// Org profile — full persisted shape (mirrors app/src/main/orgProfile.ts).
// ---------------------------------------------------------------------------

export const orgProfileSchema = z.object({
  version: z.number().int().positive().default(1),
  orgName: z.string().max(200).default(''),
  legalRegistrationLine: z.string().max(200).default(''),
  address: z.string().max(500).default(''), // multi-line
  contactEmail: contactEmailSchema.default(''),
  treasurer: signatorySchema.default({ name: '', role: '', place: '' }),
  auditor: signatorySchema.default({ name: '', role: '', place: '' }),
  logo: logoMetadataSchema.nullable().default(null),
  updatedAt: z.string().datetime(),
});

export type OrgProfile = z.infer<typeof orgProfileSchema>;

/**
 * Editable text fields only (no logo). `org-profile:save` accepts this — the
 * logo is managed through the dedicated set/remove-logo channels so binary
 * bytes never round-trip through the text-save path.
 */
export const orgProfileEditableSchema = z.object({
  orgName: z.string().max(200),
  legalRegistrationLine: z.string().max(200),
  address: z.string().max(500),
  contactEmail: contactEmailSchema,
  treasurer: signatorySchema,
  auditor: signatorySchema,
});

export type OrgProfileEditable = z.infer<typeof orgProfileEditableSchema>;

/**
 * View-model other WIs read (report builder in main resolves this). The logo
 * carries an absolute path to the on-disk asset under userData — never a path
 * inside the encrypted dataset.
 */
export const orgProfileViewModelSchema = z.object({
  orgName: z.string(),
  legalRegistrationLine: z.string(),
  address: z.string(),
  contactEmail: z.string(),
  treasurer: signatorySchema,
  auditor: signatorySchema,
  logo: z
    .object({
      absolutePath: z.string(),
      mimeType: logoMimeTypeSchema,
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
    })
    .nullable(),
});

export type OrgProfileViewModel = z.infer<typeof orgProfileViewModelSchema>;

// ---------------------------------------------------------------------------
// Channel payloads
// ---------------------------------------------------------------------------

const errorShape = z.object({
  code: z.string(),
  message: z.string(),
});

// org-profile:get — no request payload
export const orgProfileGetRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const orgProfileGetResponseSchema = z.object({
  ok: z.literal(true),
  profile: orgProfileSchema,
});

export type OrgProfileGetResponse = z.infer<typeof orgProfileGetResponseSchema>;

// org-profile:save — accepts editable text fields
export const orgProfileSaveRequestSchema = orgProfileEditableSchema;

export const orgProfileSaveResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), profile: orgProfileSchema }),
  z.object({ ok: z.literal(false), error: errorShape }),
]);

export type OrgProfileSaveResponse = z.infer<typeof orgProfileSaveResponseSchema>;

// org-profile:set-logo — raw bytes (base64) + declared name/type
export const orgProfileSetLogoRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: logoMimeTypeSchema,
  // Base64-encoded file contents. Decoded + validated in main.
  dataBase64: z.string().min(1),
});

export type OrgProfileSetLogoRequest = z.infer<typeof orgProfileSetLogoRequestSchema>;

export const orgProfileSetLogoResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), profile: orgProfileSchema }),
  z.object({ ok: z.literal(false), error: errorShape }),
]);

export type OrgProfileSetLogoResponse = z.infer<typeof orgProfileSetLogoResponseSchema>;

// org-profile:remove-logo — no request payload
export const orgProfileRemoveLogoRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const orgProfileRemoveLogoResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), profile: orgProfileSchema }),
  z.object({ ok: z.literal(false), error: errorShape }),
]);

export type OrgProfileRemoveLogoResponse = z.infer<typeof orgProfileRemoveLogoResponseSchema>;

// org-profile:get-logo — returns a data URL for renderer preview (or null)
export const orgProfileGetLogoRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const orgProfileGetLogoResponseSchema = z.object({
  ok: z.literal(true),
  dataUrl: z.string().nullable(),
});

export type OrgProfileGetLogoResponse = z.infer<typeof orgProfileGetLogoResponseSchema>;

/** Error codes surfaced by the logo channels (mapped to i18n in the renderer). */
export const LOGO_ERROR_CODES = [
  'UNSUPPORTED_TYPE',
  'TOO_LARGE',
  'INVALID_IMAGE',
  'DIMENSIONS_OUT_OF_RANGE',
  'ASPECT_OUT_OF_RANGE',
  'WRITE_FAILED',
  'SCHEMA_INVALID',
] as const;

export type LogoErrorCode = (typeof LOGO_ERROR_CODES)[number];
