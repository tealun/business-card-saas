import { z } from "zod";

export const adminOperationLogQuerySchema = z.object({
  action: z.string().trim().max(64).catch("").default(""),
  search: z.string().trim().max(128).catch("").default(""),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

export const platformOperationLogQuerySchema = adminOperationLogQuerySchema.extend({
  tenant_id: z.string().trim().max(32).regex(/^\d+$/, "tenant_id must be a numeric id").optional()
});

export const adminOperationLogItemSchema = z.object({
  log_id: z.string(),
  actor_name: z.string().nullable(),
  actor_open_userid: z.string().nullable(),
  actor_role: z.string(),
  action: z.string(),
  target_type: z.string().nullable(),
  target_id: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
  created_at: z.string()
});

export const adminOperationLogListResponseSchema = z.object({
  items: z.array(adminOperationLogItemSchema),
  total: z.number().int().nonnegative()
});

export const platformOperationLogItemSchema = adminOperationLogItemSchema.extend({
  tenant_id: z.string(),
  tenant_name: z.string().nullable()
});

export const platformOperationLogListResponseSchema = z.object({
  items: z.array(platformOperationLogItemSchema),
  total: z.number().int().nonnegative()
});

export type AdminOperationLogQuery = z.infer<typeof adminOperationLogQuerySchema>;
export type PlatformOperationLogQuery = z.infer<typeof platformOperationLogQuerySchema>;
export type AdminOperationLogItem = z.infer<typeof adminOperationLogItemSchema>;
export type AdminOperationLogListResponse = z.infer<typeof adminOperationLogListResponseSchema>;
export type PlatformOperationLogItem = z.infer<typeof platformOperationLogItemSchema>;
export type PlatformOperationLogListResponse = z.infer<typeof platformOperationLogListResponseSchema>;
