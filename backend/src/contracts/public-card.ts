import { z } from "zod";

export const publicIdSchema = z.string().regex(/^pub_[A-Za-z0-9_-]{8,40}$/);
export const shareIdSchema = z.string().regex(/^shr_[A-Za-z0-9_-]{8,64}$/);
export const anonIdSchema = z.string().regex(/^anon_[A-Za-z0-9_-]{16,80}$/);
export const visitIdSchema = z.string().regex(/^vis_[A-Za-z0-9_-]{16,80}$/);

export const publicCardResponseSchema = z.object({
  public_id: publicIdSchema,
  display_name: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  avatar_url: z.string().url().nullable(),
  fields: z.object({
    mobile: z.string().nullable(),
    email: z.string().email().nullable(),
    wechat_id: z.string().nullable()
  }),
  status: z.enum(["active"])
});

export const visitRequestSchema = z.object({
  share: shareIdSchema.optional(),
  anon_id: anonIdSchema.optional(),
  user_agent: z.string().max(512).optional()
});

export const visitResponseSchema = z.object({
  visit_id: visitIdSchema,
  visit_token: z.string().min(32),
  anon_id: anonIdSchema,
  expires_in: z.number().int().positive()
});

export const actionRequestSchema = z.object({
  action_type: z.enum(["save_phone", "call_phone", "copy_phone", "copy_email", "view_site", "add_wecom"])
});

export const actionResponseSchema = z.object({
  accepted: z.literal(true),
  idempotent: z.boolean()
});

export type PublicCardResponse = z.infer<typeof publicCardResponseSchema>;
export type VisitRequest = z.infer<typeof visitRequestSchema>;
export type VisitResponse = z.infer<typeof visitResponseSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionResponse = z.infer<typeof actionResponseSchema>;
