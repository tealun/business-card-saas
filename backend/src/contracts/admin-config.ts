import { z } from "zod";

export const adminFieldKeySchema = z.enum(["display_name", "title", "mobile", "phone", "email", "wechat_id", "address"]);

export const adminFieldRuleSchema = z.object({
  field_key: adminFieldKeySchema,
  label: z.string().min(1).max(32),
  locked: z.boolean(),
  employee_editable: z.boolean(),
  default_visible: z.boolean()
});

const adminFieldRuleListSchema = z.array(adminFieldRuleSchema).min(1).superRefine((fields, ctx) => {
  const seen = new Set<string>();
  fields.forEach((field, index) => {
    if (seen.has(field.field_key)) {
      ctx.addIssue({
        code: "custom",
        path: [index, "field_key"],
        message: "field_key must be unique"
      });
    }
    seen.add(field.field_key);
  });
});

export const adminFieldSettingsResponseSchema = z.object({
  tenant_id: z.string(),
  fields: adminFieldRuleListSchema
});

export const updateAdminFieldSettingsRequestSchema = z.object({
  fields: adminFieldRuleListSchema
});

export const adminCompanyProfileSchema = z.object({
  tenant_id: z.string(),
  display_name: z.string().min(1).max(255),
  short_name: z.string().max(128).nullable(),
  logo_url: z.string().url().nullable(),
  website_url: z.string().url().nullable(),
  address: z.string().max(255).nullable(),
  intro_blocks: z.array(z.record(z.string(), z.unknown())),
  visible: z.boolean(),
  status: z.enum(["draft", "published"])
});

export const updateAdminCompanyProfileRequestSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  short_name: z.string().max(128).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  intro_blocks: z.array(z.record(z.string(), z.unknown())).optional(),
  visible: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional()
});

export const adminTemplateSchema = z.object({
  template_id: z.string().min(1).max(64),
  name: z.string().min(1).max(128),
  is_default: z.boolean(),
  background_url: z.string().url().nullable(),
  logo_url: z.string().url().nullable(),
  color_scheme: z.record(z.string(), z.unknown()),
  layout: z.record(z.string(), z.unknown()),
  status: z.enum(["active", "disabled"])
});

export const adminTemplateListResponseSchema = z.object({
  tenant_id: z.string(),
  items: z.array(adminTemplateSchema)
});

export const createAdminTemplateRequestSchema = z.object({
  name: z.string().min(1).max(128),
  background_url: z.string().url().nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  color_scheme: z.record(z.string(), z.unknown()).optional(),
  layout: z.record(z.string(), z.unknown()).optional()
});

export const updateAdminTemplateRequestSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  background_url: z.string().url().nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  color_scheme: z.record(z.string(), z.unknown()).optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "disabled"]).optional()
});

export type AdminFieldRule = z.infer<typeof adminFieldRuleSchema>;
export type AdminFieldSettingsResponse = z.infer<typeof adminFieldSettingsResponseSchema>;
export type UpdateAdminFieldSettingsRequest = z.infer<typeof updateAdminFieldSettingsRequestSchema>;
export type AdminCompanyProfile = z.infer<typeof adminCompanyProfileSchema>;
export type UpdateAdminCompanyProfileRequest = z.infer<typeof updateAdminCompanyProfileRequestSchema>;
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;
export type AdminTemplateListResponse = z.infer<typeof adminTemplateListResponseSchema>;
export type CreateAdminTemplateRequest = z.infer<typeof createAdminTemplateRequestSchema>;
export type UpdateAdminTemplateRequest = z.infer<typeof updateAdminTemplateRequestSchema>;
