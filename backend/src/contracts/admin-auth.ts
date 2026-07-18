import { z } from "zod";

export const adminRoleSchema = z.enum(["owner", "admin", "operator", "auditor"]);

// Platform-side roles follow the 01_08 matrix (01_09 §3). They live in a separate
// schema on purpose: platform role strings must never be accepted where tenant
// roles are validated (01_08 platform role migration contract, rule 3).
export const platformAdminRoleSchema = z.enum(["platform_owner", "ops", "support", "finance", "engineer", "auditor"]);

// migrate_v1_14 renames legacy platform_admins.role='owner' rows to 'platform_owner'.
// Until it has run everywhere, reads must treat the legacy value as the built-in
// platform owner; writes only ever use the new enum.
export const LEGACY_PLATFORM_OWNER_ROLE = "owner";

export function normalizePlatformAdminRole(role: string): PlatformAdminRole | null {
  if (role === LEGACY_PLATFORM_OWNER_ROLE) {
    return "platform_owner";
  }
  const parsed = platformAdminRoleSchema.safeParse(role);
  return parsed.success ? parsed.data : null;
}

export const adminAuthCodeRequestSchema = z.object({
  code: z.string().min(1).max(256),
  claim_token: z.string().min(32).max(160).optional()
});

export const adminIdentitySchema = z.object({
  tenant_id: z.string(),
  tenant_name: z.string(),
  member_identity_id: z.string().nullable(),
  open_userid: z.string(),
  role: z.union([adminRoleSchema, platformAdminRoleSchema]),
  account_type: z.enum(["tenant", "platform"]).default("tenant"),
  permissions: z.array(z.string()).default([]),
  menu_scopes: z.array(z.string()).default([])
});

export const adminLoginResponseSchema = z.object({
  access_token: z.string().min(32),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  admin: adminIdentitySchema
});

export const adminSessionMeResponseSchema = z.object({
  admin: adminIdentitySchema
});

export const adminPasswordLoginRequestSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(128)
});

export const adminChangePasswordRequestSchema = z.object({
  old_password: z.string().min(1).max(128),
  new_password: z.string().min(8).max(128)
});

export const adminChangePasswordResponseSchema = z.object({
  changed: z.literal(true)
});

export const adminWecomLoginConfigResponseSchema = z.object({
  appid: z.string().min(1),
  redirect_uri: z.string().url(),
  login_url: z.string().url(),
  state: z.string().min(32),
  expires_in: z.number().int().positive()
});

export const adminWecomScanCallbackQuerySchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") {
      return value;
    }
    const query = value as Record<string, unknown>;
    return {
      ...query,
      code: query.code ?? query.auth_code
    };
  },
  z.object({
    code: z.string().min(1).max(256),
    state: z.string().min(32).max(160)
  })
);

export type AdminRole = z.infer<typeof adminRoleSchema>;
export type PlatformAdminRole = z.infer<typeof platformAdminRoleSchema>;
export type AdminPasswordLoginRequest = z.infer<typeof adminPasswordLoginRequestSchema>;
export type AdminChangePasswordRequest = z.infer<typeof adminChangePasswordRequestSchema>;
export type AdminAuthCodeRequest = z.infer<typeof adminAuthCodeRequestSchema>;
export type AdminWecomLoginConfigResponse = z.infer<typeof adminWecomLoginConfigResponseSchema>;
export type AdminWecomScanCallbackQuery = z.infer<typeof adminWecomScanCallbackQuerySchema>;
export type AdminIdentity = z.infer<typeof adminIdentitySchema>;
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;
export type AdminSessionMeResponse = z.infer<typeof adminSessionMeResponseSchema>;
