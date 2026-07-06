import { z } from "zod";

export const adminRoleSchema = z.enum(["owner", "admin", "operator", "auditor"]);

export const adminAuthCodeRequestSchema = z.object({
  code: z.string().min(1).max(256)
});

export const adminIdentitySchema = z.object({
  tenant_id: z.string(),
  tenant_name: z.string(),
  member_identity_id: z.string().nullable(),
  open_userid: z.string(),
  role: adminRoleSchema
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

export type AdminRole = z.infer<typeof adminRoleSchema>;
export type AdminAuthCodeRequest = z.infer<typeof adminAuthCodeRequestSchema>;
export type AdminIdentity = z.infer<typeof adminIdentitySchema>;
export type AdminLoginResponse = z.infer<typeof adminLoginResponseSchema>;
export type AdminSessionMeResponse = z.infer<typeof adminSessionMeResponseSchema>;
