import { z } from "zod";

export const wecomAuthorizationLinkRequestSchema = z.object({
  redirect_uri: z.string().url().max(2048).optional(),
  state: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  auth_type: z.enum(["official", "test"]).default("official"),
  app_ids: z.array(z.string().min(1).max(64)).max(100).optional()
});

export const wecomAuthorizationLinkResponseSchema = z.object({
  authorization_url: z.string().url(),
  suite_id: z.string(),
  pre_auth_code_expires_in: z.number().int().positive(),
  redirect_uri: z.string().url(),
  state: z.string(),
  auth_type: z.enum(["official", "test"])
});

const queryString = z.preprocess((value) => (Array.isArray(value) ? value[0] : value), z.string().trim());

export const wecomAuthorizationCompleteQuerySchema = z.object({
  auth_code: queryString.pipe(z.string().min(1).max(512)),
  state: queryString.pipe(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)).optional()
});

export const wecomAuthorizationCompleteResponseSchema = z.object({
  handled: z.literal(true),
  tenant_id: z.string(),
  open_corpid: z.string(),
  corp_name: z.string(),
  auth_status: z.literal("active"),
  state: z.string().optional()
});

export type WecomAuthorizationLinkRequest = z.infer<typeof wecomAuthorizationLinkRequestSchema>;
export type WecomAuthorizationLinkResponse = z.infer<typeof wecomAuthorizationLinkResponseSchema>;
export type WecomAuthorizationCompleteQuery = z.infer<typeof wecomAuthorizationCompleteQuerySchema>;
export type WecomAuthorizationCompleteResponse = z.infer<typeof wecomAuthorizationCompleteResponseSchema>;
