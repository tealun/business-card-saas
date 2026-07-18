import { z } from "zod";
import { adminRoleSchema, platformAdminRoleSchema } from "./admin-auth.js";

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
  // Reads normalize legacy 'owner' rows to 'platform_owner' before this parse
  // (migrate_v1_14 pending), so responses only ever carry the new enum.
  role: platformAdminRoleSchema,
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
  total: z.number().int().nonnegative(),
  today: z
    .object({
      received: z.number().int().nonnegative(),
      succeeded: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      retryable: z.number().int().nonnegative()
    })
    .optional()
});

export const updatePlatformAdminStatusRequestSchema = z.object({
  status: z.enum(["active", "disabled"])
});

// M1-S4 (01_09 §4.1): platform account management. Roles are limited to the M1
// assignable subset; password complexity policy (length, letter+digit) is enforced
// in the service layer so violations return curated Chinese messages instead of
// the generic validation payload.
export const platformAccountCreateRequestSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(1).max(128),
  role: z.enum(["ops", "support"])
});

export const platformAccountRoleUpdateRequestSchema = z.object({
  role: z.enum(["ops", "support"])
});

export const platformAccountDeleteResponseSchema = z.object({
  deleted: z.literal(true)
});

export const updateTenantAdminStatusRequestSchema = z.object({
  status: z.enum(["active", "disabled"])
});

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;
export type AdminEventQuery = z.infer<typeof adminEventQuerySchema>;
export type TenantAdminSummary = z.infer<typeof tenantAdminSummarySchema>;
export type TenantAdminListResponse = z.infer<typeof tenantAdminListResponseSchema>;
export type PlatformAdminListResponse = z.infer<typeof platformAdminListResponseSchema>;
export type AdminEventListResponse = z.infer<typeof adminEventListResponseSchema>;
export type PlatformAdminSummary = z.infer<typeof platformAdminSummarySchema>;
export type PlatformAccountCreateRequest = z.infer<typeof platformAccountCreateRequestSchema>;
export type PlatformAccountRoleUpdateRequest = z.infer<typeof platformAccountRoleUpdateRequestSchema>;
export type PlatformAccountDeleteResponse = z.infer<typeof platformAccountDeleteResponseSchema>;
