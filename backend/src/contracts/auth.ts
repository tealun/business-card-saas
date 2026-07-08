import { z } from "zod";

export const authCodeRequestSchema = z.object({
  code: z.string().min(1).max(256)
});

export const switchIdentityRequestSchema = z.object({
  member_identity_id: z.string().min(1).max(64)
});

export const identitySummarySchema = z.object({
  identity_type: z.enum(["personal", "wecom_member"]),
  tenant_id: z.string(),
  tenant_name: z.string(),
  member_identity_id: z.string(),
  display_name: z.string(),
  open_userid: z.string().nullable(),
  public_id: z.string()
});

export const qyLoginResponseSchema = z.object({
  access_token: z.string().min(32),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  account: z.object({
    account_id: z.string(),
    status: z.enum(["active"])
  }),
  current_identity: identitySummarySchema,
  identities: z.array(identitySummarySchema).min(1)
});

export type AuthCodeRequest = z.infer<typeof authCodeRequestSchema>;
export type SwitchIdentityRequest = z.infer<typeof switchIdentityRequestSchema>;
export type IdentitySummary = z.infer<typeof identitySummarySchema>;
export type QyLoginResponse = z.infer<typeof qyLoginResponseSchema>;
