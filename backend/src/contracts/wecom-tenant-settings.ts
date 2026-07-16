import { z } from "zod";

export const wecomQrCodeSourceSchema = z.enum(["enterprise_first", "employee_upload_only", "enterprise_only"]);

export const wecomTenantSettingsSchema = z.object({
  tenant_id: z.string(),
  auto_sync_on_auth: z.boolean(),
  auto_create_cards: z.boolean(),
  auto_disable_left_members: z.boolean(),
  allow_employee_privacy_edit: z.boolean(),
  allow_employee_share_edit: z.boolean(),
  allow_employee_wecom_qrcode_upload: z.boolean(),
  qrcode_source: wecomQrCodeSourceSchema,
  updated_at: z.string().nullable()
});

export const updateWecomTenantSettingsRequestSchema = z.object({
  auto_sync_on_auth: z.boolean().optional(),
  auto_create_cards: z.boolean().optional(),
  auto_disable_left_members: z.boolean().optional(),
  allow_employee_privacy_edit: z.boolean().optional(),
  allow_employee_share_edit: z.boolean().optional(),
  allow_employee_wecom_qrcode_upload: z.boolean().optional(),
  qrcode_source: wecomQrCodeSourceSchema.optional()
});

export type WecomQrCodeSource = z.infer<typeof wecomQrCodeSourceSchema>;
export type WecomTenantSettings = z.infer<typeof wecomTenantSettingsSchema>;
export type UpdateWecomTenantSettingsRequest = z.infer<typeof updateWecomTenantSettingsRequestSchema>;
