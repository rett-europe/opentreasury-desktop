// Profile IPC contract — P0-2 trial-readiness.
// Channel + Zod schemas for `profile:get`, `profile:save`.
//
// The profile is stored in userData/profile.json and loaded at bootstrap.
// Changes are written atomically (tmp → fsync → rename) for crash safety.

import { z } from 'zod';

export const IPC_PROFILE_GET = 'profile:get';
export const IPC_PROFILE_SAVE = 'profile:save';

// Profile schema — mirrors app/src/main/profile.ts profileSchema
export const profileSchema = z.object({
  userId: z.string().length(26), // ULID
  name: z.string().max(100),
  role: z.string().max(50),
  ngoName: z.string().max(200),
  identitySource: z.enum(['local', 'aad']).default('local'),
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type Profile = z.infer<typeof profileSchema>;

// profile:get — no request payload
export const profileGetRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const profileGetResponseSchema = z.object({
  ok: z.literal(true),
  profile: profileSchema.nullable(), // null on first launch
});

export type ProfileGetResponse = z.infer<typeof profileGetResponseSchema>;

// profile:save — accepts a full profile object
export const profileSaveRequestSchema = profileSchema;

export const profileSaveResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    profile: profileSchema,
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
]);

export type ProfileSaveResponse = z.infer<typeof profileSaveResponseSchema>;
