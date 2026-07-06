import { z } from "zod";
import { employeeCardResponseSchema, updateEmployeeCardRequestSchema } from "./employee-card.js";

export const adminOverviewResponseSchema = z.object({
  tenant_id: z.string(),
  tenant_name: z.string(),
  member_count: z.number().int().min(0),
  card_count: z.number().int().min(0),
  active_card_count: z.number().int().min(0)
});

export const adminMemberSummarySchema = z.object({
  member_identity_id: z.string(),
  userid: z.string().nullable(),
  open_userid: z.string().nullable(),
  display_name: z.string(),
  status: z.enum(["active", "disabled"]),
  public_id: z.string()
});

export const adminMemberListResponseSchema = z.object({
  items: z.array(adminMemberSummarySchema),
  total: z.number().int().min(0)
});

export const adminMemberCardResponseSchema = employeeCardResponseSchema;
export const updateAdminMemberCardRequestSchema = updateEmployeeCardRequestSchema;

export const adminMemberSyncResponseSchema = z.object({
  tenant_id: z.string(),
  synced_count: z.number().int().min(0),
  skipped_count: z.number().int().min(0)
});

export const adminSyncEventSummarySchema = z.object({
  id: z.string(),
  source: z.enum(["command", "data"]),
  event_key: z.string(),
  event_type: z.string(),
  change_type: z.string().nullable(),
  status: z.enum(["received", "processing", "done", "failed"]),
  retry_count: z.number().int().min(0),
  received_at: z.string(),
  processed_at: z.string().nullable(),
  last_error: z.string().nullable()
});

export const adminSyncEventListResponseSchema = z.object({
  items: z.array(adminSyncEventSummarySchema),
  total: z.number().int().min(0)
});

export type AdminOverviewResponse = z.infer<typeof adminOverviewResponseSchema>;
export type AdminMemberSummary = z.infer<typeof adminMemberSummarySchema>;
export type AdminMemberListResponse = z.infer<typeof adminMemberListResponseSchema>;
export type AdminMemberCardResponse = z.infer<typeof adminMemberCardResponseSchema>;
export type UpdateAdminMemberCardRequest = z.infer<typeof updateAdminMemberCardRequestSchema>;
export type AdminMemberSyncResponse = z.infer<typeof adminMemberSyncResponseSchema>;
export type AdminSyncEventSummary = z.infer<typeof adminSyncEventSummarySchema>;
export type AdminSyncEventListResponse = z.infer<typeof adminSyncEventListResponseSchema>;
