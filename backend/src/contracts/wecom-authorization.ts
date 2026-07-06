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

export type WecomAuthorizationLinkRequest = z.infer<typeof wecomAuthorizationLinkRequestSchema>;
export type WecomAuthorizationLinkResponse = z.infer<typeof wecomAuthorizationLinkResponseSchema>;
