import { z } from "zod";

export const publicIdSchema = z.string().regex(/^pub_[A-Za-z0-9_-]{8,40}$/);
export const shareIdSchema = z.string().regex(/^shr_[A-Za-z0-9_-]{8,64}$/);
export const anonIdSchema = z.string().regex(/^anon_[A-Za-z0-9_.-]{16,120}$/);
export const visitIdSchema = z.string().regex(/^vis_[A-Za-z0-9_-]{16,80}$/);
const imageSourceSchema = z
  .string()
  .refine((value) => /^https?:\/\//.test(value) || value.startsWith("/") || /^data:image\/(png|jpe?g|webp);base64,/i.test(value), {
    message: "image source must be an http(s) URL, absolute path, or data image"
  });

export const publicCardFieldSchema = z.object({
  company: z.string().nullable().optional(),
  company_short_name: z.string().nullable().optional(),
  mobile: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().email().nullable(),
  wechat_id: z.string().nullable(),
  wechat_qrcode_url: imageSourceSchema.nullable().optional(),
  wecom_qrcode_url: imageSourceSchema.nullable().optional(),
  address: z.string().nullable()
});

export const publicCardStatsSchema = z.object({
  visitor_count: z.number().int().nonnegative(),
  visit_count: z.number().int().nonnegative(),
  like_count: z.number().int().nonnegative(),
  liked_by_current_visitor: z.boolean().optional(),
  recent_visitor_avatars: z.array(z.string()).optional()
});

export const publicCardResponseSchema = z.object({
  public_id: publicIdSchema,
  status: z.enum(["active", "disabled", "expired", "employee_left", "tenant_cancelled"]),
  allow_forward: z.boolean(),
  card: z.object({
    display_name: z.string(),
    title: z.string().nullable(),
    company: z.string().nullable(),
    company_short_name: z.string().nullable().optional(),
    avatar_url: imageSourceSchema.nullable(),
    fields: publicCardFieldSchema
  }),
  template: z.object({
    template_id: z.string(),
    logo_url: imageSourceSchema.nullable(),
    background_url: imageSourceSchema.nullable(),
    color_scheme: z.record(z.string(), z.unknown()),
    layout: z.record(z.string(), z.unknown())
  }),
  company_profile: z.object({
    name: z.string(),
    short_name: z.string().nullable().optional(),
    intro_blocks: z.array(z.record(z.string(), z.unknown())),
    website_url: z.string().url().nullable(),
    address: z.string().nullable()
  }),
  videos: z.array(
    z.object({
      video_id: z.string(),
      title: z.string(),
      video_url: z.string().url(),
      cover_url: z.string().url().nullable()
    })
  ),
  honors: z.array(
    z.object({
      honor_id: z.string(),
      title: z.string(),
      body: z.string().nullable(),
      images: z.array(
        z.object({
          image_url: z.string().url(),
          title: z.string().nullable(),
          caption: z.string().nullable()
        })
      )
    })
  ),
  stats: publicCardStatsSchema
});

export const visitRequestSchema = z.object({
  share: shareIdSchema.optional(),
  anon_id: anonIdSchema.optional(),
  fingerprint: z.string().max(256).optional(),
  user_agent: z.string().max(512).optional()
});

export const visitResponseSchema = z.object({
  visit_id: visitIdSchema,
  visit_token: z.string().min(32),
  anon_id: anonIdSchema,
  expires_in: z.number().int().positive(),
  stats: publicCardStatsSchema
});

export const actionRequestSchema = z.object({
  action_type: z.enum([
    "save_phone",
    "call_phone",
    "copy_phone",
    "copy_email",
    "copy_wechat",
    "view_site",
    "add_wecom",
    "open_map",
    "play_company_video",
    "view_honor_image",
    "expand_company_intro",
    "view_paper_card",
    "like_card",
    "exchange_card",
    "upgrade_enterprise"
  ])
});

export const actionResponseSchema = z.object({
  accepted: z.literal(true),
  idempotent: z.boolean(),
  stats: publicCardStatsSchema.optional()
});

export const deriveShareRequestSchema = z.object({
  parent_share_id: shareIdSchema
});

export const deriveShareResponseSchema = z.object({
  share_id: shareIdSchema,
  parent_share_id: shareIdSchema,
  depth: z.number().int().min(0).max(3),
  capped: z.boolean()
});

export type PublicCardResponse = z.infer<typeof publicCardResponseSchema>;
export type VisitRequest = z.infer<typeof visitRequestSchema>;
export type VisitResponse = z.infer<typeof visitResponseSchema>;
export type ActionRequest = z.infer<typeof actionRequestSchema>;
export type ActionResponse = z.infer<typeof actionResponseSchema>;
export type DeriveShareRequest = z.infer<typeof deriveShareRequestSchema>;
export type DeriveShareResponse = z.infer<typeof deriveShareResponseSchema>;
