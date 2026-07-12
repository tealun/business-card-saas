import { z } from "zod";
import { publicCardResponseSchema, publicIdSchema, shareIdSchema } from "./public-card.js";

const imageSourceSchema = z
  .string()
  .refine((value) => /^https?:\/\//.test(value) || value.startsWith("/") || /^data:image\/(png|jpe?g|webp);base64,/i.test(value), {
    message: "avatar_url must be an http(s) URL, absolute path, or data image"
  });

export const employeeCardResponseSchema = z.object({
  card_id: z.string(),
  public_id: publicIdSchema,
  display_name: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  company_short_name: z.string().nullable().optional(),
  avatar_url: imageSourceSchema.nullable(),
  fields: z.object({
    department: z.string().nullable().optional(),
    mobile: z.string().nullable(),
    phone: z.string().nullable().optional(),
    email: z.string().email().nullable(),
    wechat_id: z.string().nullable(),
    wechat_qrcode_url: imageSourceSchema.nullable().optional(),
    wecom_qrcode_url: imageSourceSchema.nullable().optional(),
    address: z.string().nullable().optional(),
    website: z.string().url().nullable().optional()
  }),
  status: z.enum(["active", "disabled"]),
  privacy: z.object({
    show_mobile: z.boolean(),
    show_email: z.boolean(),
    show_wechat: z.boolean()
  }),
  editable_fields: z.array(z.string()).optional()
});

export const employeeShareResponseSchema = z.object({
  public_id: publicIdSchema,
  share_id: shareIdSchema,
  scene: shareIdSchema,
  path: z.string().min(1)
});

export const updateEmployeeCardRequestSchema = z.object({
  avatar_url: imageSourceSchema.nullable().optional(),
  display_name: z.string().min(1).max(128).optional(),
  title: z.string().max(128).nullable().optional(),
  fields: z
    .object({
      department: z.string().max(128).nullable().optional(),
      mobile: z.string().max(32).nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
      email: z.string().email().nullable().optional(),
      wechat_id: z.string().max(128).nullable().optional(),
      wechat_qrcode_url: imageSourceSchema.nullable().optional(),
      wecom_qrcode_url: imageSourceSchema.nullable().optional(),
      address: z.string().max(255).nullable().optional(),
      website: z.string().url().nullable().optional()
    })
    .optional(),
  privacy: z
    .object({
      show_mobile: z.boolean().optional(),
      show_email: z.boolean().optional(),
      show_wechat: z.boolean().optional()
    })
    .optional()
});

export const updateEmployeeCardStyleRequestSchema = z.object({
  template_id: z.string().min(1).max(64).optional(),
  logo_url: imageSourceSchema.nullable().optional(),
  background_url: imageSourceSchema.nullable().optional(),
  color_scheme: z.record(z.string(), z.unknown()).optional(),
  layout: z.record(z.string(), z.unknown()).optional()
});

export const updateWechatQrCodeRequestSchema = z.object({
  qrcode_url: imageSourceSchema.nullable()
});

export const employeeWechatQrCodeResponseSchema = z.object({
  qr_url: imageSourceSchema.nullable(),
  source: z.enum(["personal_upload", "enterprise_cache", "not_configured"]),
  cached: z.boolean()
});

export const employeeCardStatsResponseSchema = z.object({
  visitor_count: z.number().int().nonnegative(),
  visit_count: z.number().int().nonnegative(),
  recent_visitors: z.array(
    z.object({
      visitor_key: z.string(),
      visitor_label: z.string(),
      visit_count: z.number().int().positive(),
      trust_level: z.string().nullable().optional(),
      channel: z.string().nullable(),
      last_visit_at: z.string()
    })
  )
});

export type EmployeeCardStatsResponse = z.infer<typeof employeeCardStatsResponseSchema>;
export type EmployeeCardResponse = z.infer<typeof employeeCardResponseSchema>;
export type EmployeeShareResponse = z.infer<typeof employeeShareResponseSchema>;
export type UpdateEmployeeCardRequest = z.infer<typeof updateEmployeeCardRequestSchema>;
export type UpdateEmployeeCardStyleRequest = z.infer<typeof updateEmployeeCardStyleRequestSchema>;
export type EmployeeCardPreviewResponse = z.infer<typeof publicCardResponseSchema>;
export type UpdateWechatQrCodeRequest = z.infer<typeof updateWechatQrCodeRequestSchema>;
export type EmployeeWechatQrCodeResponse = z.infer<typeof employeeWechatQrCodeResponseSchema>;
