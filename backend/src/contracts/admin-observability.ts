import { z } from "zod";
import { adminRoleSchema } from "./admin-auth.js";

const callbackSourceSchema = z.enum(["command", "data", "sync"]);
const callbackStatusSchema = z.enum(["received", "processing", "done", "failed", "dead"]);

export const adminListQuerySchema = z.object({
  status: z.enum(["all", "active", "disabled"]).catch("all"),
  search: z.string().max(128).catch("").default("")
});

export const adminEventQuerySchema = z.object({
  status: z.enum(["all", "received", "processing", "done", "failed", "dead"]).catch("all"),
  source: z.enum(["all", "command", "data", "sync"]).catch("all"),
  search: z.string().max(128).catch("").default("")
});

export const tenantAdminSummarySchema = z.object({
  admin_id: z.string(),
  member_identity_id: z.string().nullable(),
  display_name: z.string().nullable(),
  open_userid: z.string().nullable(),
  userid: z.string().nullable(),
  role: adminRoleSchema,
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string()
});

export const tenantAdminListResponseSchema = z.object({
  items: z.array(tenantAdminSummarySchema),
  total: z.number().int().nonnegative()
});

export const platformAdminSummarySchema = z.object({
  admin_id: z.string(),
  username: z.string(),
  role: adminRoleSchema,
  status: z.string(),
  password_updated_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

export const platformAdminListResponseSchema = z.object({
  items: z.array(platformAdminSummarySchema),
  total: z.number().int().nonnegative()
});

export const adminEventSummarySchema = z.object({
  event_id: z.string(),
  tenant_id: z.string().nullable(),
  tenant_name: z.string().nullable(),
  source: callbackSourceSchema,
  event_key: z.string(),
  event_type: z.string(),
  change_type: z.string().nullable(),
  status: callbackStatusSchema,
  retry_count: z.number().int().nonnegative(),
  received_at: z.string(),
  processed_at: z.string().nullable(),
  last_error: z.string().nullable()
});

export const adminEventListResponseSchema = z.object({
  items: z.array(adminEventSummarySchema),
  total: z.number().int().nonnegative()
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminEventQuery = z.infer<typeof adminEventQuerySchema>;
export type TenantAdminListResponse = z.infer<typeof tenantAdminListResponseSchema>;
export type PlatformAdminListResponse = z.infer<typeof platformAdminListResponseSchema>;
export type AdminEventListResponse = z.infer<typeof adminEventListResponseSchema>;
