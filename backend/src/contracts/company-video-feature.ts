import { z } from "zod";

export const VIDEO_FEATURE_KEY = "company_video_upload";
export const MIN_VIDEO_LIMIT_BYTES = 1024 * 1024;
export const MAX_VIDEO_LIMIT_BYTES = 1024 * 1024 * 1024;

export const platformVideoFeatureRequestSchema = z.object({
  enabled: z.boolean(),
  default_limit_bytes: z.number().int().min(MIN_VIDEO_LIMIT_BYTES).max(MAX_VIDEO_LIMIT_BYTES)
});

export const tenantVideoFeatureRequestSchema = z.object({
  enabled: z.boolean(),
  limit_bytes: z.number().int().min(MIN_VIDEO_LIMIT_BYTES).nullable()
});

export const videoCapabilitySchema = z.object({
  enabled: z.boolean(),
  effective_limit_bytes: z.number().int(),
  effective_limit_mb: z.number(),
  source: z.enum(["platform_default", "tenant_override"])
});

export const platformVideoFeatureSchema = z.object({
  enabled: z.boolean(),
  default_limit_bytes: z.number().int(),
  default_limit_mb: z.number(),
  updated_at: z.string()
});

export const tenantVideoFeatureSchema = z.object({
  tenant_id: z.string(),
  tenant_name: z.string(),
  enabled: z.boolean(),
  limit_bytes: z.number().int().nullable(),
  effective_enabled: z.boolean(),
  effective_limit_bytes: z.number().int(),
  source: z.enum(["platform_default", "tenant_override"]),
  updated_at: z.string().nullable()
});

export type PlatformVideoFeatureRequest = z.infer<typeof platformVideoFeatureRequestSchema>;
export type TenantVideoFeatureRequest = z.infer<typeof tenantVideoFeatureRequestSchema>;
export type VideoCapability = z.infer<typeof videoCapabilitySchema>;
