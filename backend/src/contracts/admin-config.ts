import { z } from "zod";

export const adminFieldKeySchema = z.enum([
  "avatar_url",
  "display_name",
  "title",
  "mobile",
  "phone",
  "email",
  "wechat_id",
  "address"
]);

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

export const companyModuleKeys = ["services", "profile", "videos", "honors"] as const;
export const companyModuleKeySchema = z.enum(companyModuleKeys);
export const companyModuleLayoutSchema = z.enum(["text", "image", "graphic", "grid", "carousel"]);
export const companyModuleSchema = z.object({
  key: companyModuleKeySchema,
  title: z.string().min(1).max(32),
  visible: z.boolean(),
  sort_order: z.number().int().min(0).max(99),
  layout: companyModuleLayoutSchema
});
export const companyServiceItemSchema = z.object({
  id: z.string().regex(/^service_[A-Za-z0-9_-]{1,64}$/),
  title: z.string().max(80).default(""),
  description: z.string().max(300).default(""),
  image_url: z.string().url().refine((value) => /^https?:\/\//.test(value), "image URL must use http(s)").nullable().default(null),
  visible: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(999).default(0)
}).refine((item) => Boolean(item.title.trim() || item.image_url), {
  message: "service item requires a title or image"
});

const contentImageSchema = z.object({
  url: z.string().url().refine((value) => /^https?:\/\//.test(value), "image URL must use http(s)"),
  caption: z.string().max(160).default("")
});
export const companyIntroBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(120) }),
  z.object({ type: z.literal("paragraph"), text: z.string().min(1).max(3000) }),
  z.object({ type: z.literal("list"), items: z.array(z.string().min(1).max(300)).min(1).max(20) }),
  z.object({ type: z.literal("quote"), text: z.string().min(1).max(1000) }),
  z.object({ type: z.literal("image"), url: z.string().url().refine((value) => /^https?:\/\//.test(value), "image URL must use http(s)"), caption: z.string().max(160).default("") }),
  z.object({ type: z.literal("gallery"), images: z.array(contentImageSchema).min(1).max(12) }),
  z.object({ type: z.literal("video"), video_id: z.string().regex(/^\d+$/) })
]);

export const companyDisplayModulesSchema = z.array(companyModuleSchema).length(4).superRefine((modules, ctx) => {
  const keys = new Set(modules.map((module) => module.key));
  for (const key of companyModuleKeys) {
    if (!keys.has(key)) {
      ctx.addIssue({ code: "custom", message: `missing module key: ${key}` });
    }
  }
  if (keys.size !== modules.length) {
    ctx.addIssue({ code: "custom", message: "module keys must be unique" });
  }
});

export const adminCompanyProfileSchema = z.object({
  tenant_id: z.string(),
  display_name: z.string().min(1).max(255),
  short_name: z.string().max(128).nullable(),
  logo_url: z.string().url().nullable(),
  website_url: z.string().url().nullable(),
  address: z.string().max(255).nullable(),
  intro_blocks: z.array(companyIntroBlockSchema).max(60),
  service_items: z.array(companyServiceItemSchema).max(30),
  display_modules: companyDisplayModulesSchema,
  visible: z.boolean(),
  status: z.enum(["draft", "published"])
});

export const adminCompanyHonorImageSchema = z.object({
  image_id: z.string().optional(),
  image_url: z.string().url().refine((value) => /^https?:\/\//.test(value), "image URL must use http(s)"),
  title: z.string().max(120).nullable().default(null),
  caption: z.string().max(300).nullable().default(null),
  sort_order: z.number().int().min(0).max(999).default(0)
});

export const adminCompanyHonorSchema = z.object({
  honor_id: z.string(),
  title: z.string().min(1).max(255),
  body: z.string().max(2000).nullable(),
  sort_order: z.number().int().min(0).max(999),
  visible: z.boolean(),
  status: z.enum(["draft", "published"]),
  images: z.array(adminCompanyHonorImageSchema).max(12)
});

export const adminCompanyHonorListResponseSchema = z.object({
  tenant_id: z.string(),
  items: z.array(adminCompanyHonorSchema)
});

export const createAdminCompanyHonorRequestSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).max(999).optional(),
  visible: z.boolean().optional(),
  status: z.enum(["draft", "published"]).optional(),
  images: z.array(adminCompanyHonorImageSchema).max(12).optional()
});

export const updateAdminCompanyHonorRequestSchema = createAdminCompanyHonorRequestSchema.partial();

export const updateAdminCompanyProfileRequestSchema = z.object({
  display_name: z.string().min(1).max(255).optional(),
  short_name: z.string().max(128).nullable().optional(),
  logo_url: z.string().url().nullable().optional(),
  website_url: z.string().url().nullable().optional(),
  address: z.string().max(255).nullable().optional(),
  intro_blocks: z.array(companyIntroBlockSchema).max(60).optional(),
  service_items: z.array(companyServiceItemSchema).max(30).optional(),
  display_modules: companyDisplayModulesSchema.optional(),
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
export type CompanyModule = z.infer<typeof companyModuleSchema>;
export type CompanyServiceItem = z.infer<typeof companyServiceItemSchema>;
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;
export type AdminTemplateListResponse = z.infer<typeof adminTemplateListResponseSchema>;
export type CreateAdminTemplateRequest = z.infer<typeof createAdminTemplateRequestSchema>;
export type UpdateAdminTemplateRequest = z.infer<typeof updateAdminTemplateRequestSchema>;
export type AdminCompanyHonor = z.infer<typeof adminCompanyHonorSchema>;
export type AdminCompanyHonorListResponse = z.infer<typeof adminCompanyHonorListResponseSchema>;
export type CreateAdminCompanyHonorRequest = z.infer<typeof createAdminCompanyHonorRequestSchema>;
export type UpdateAdminCompanyHonorRequest = z.infer<typeof updateAdminCompanyHonorRequestSchema>;
