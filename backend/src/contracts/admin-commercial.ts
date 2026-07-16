import { z } from "zod";

export const commercialPlanSchema = z.object({
  plan_key: z.string(),
  name: z.string(),
  status: z.string(),
  billing_period: z.string(),
  price_cents: z.number().int().nonnegative(),
  currency: z.string(),
  member_limit: z.number().int().nonnegative(),
  card_limit: z.number().int().nonnegative(),
  video_limit_bytes: z.number().int().nonnegative()
});

export const tenantSubscriptionSchema = z.object({
  subscription_id: z.string().nullable(),
  plan: commercialPlanSchema,
  status: z.string(),
  started_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  usage: z.object({
    member_count: z.number().int().nonnegative(),
    active_card_count: z.number().int().nonnegative(),
    video_count: z.number().int().nonnegative()
  }),
  quota_adjustments: z.object({
    member: z.number().int(),
    card: z.number().int(),
    video_mb: z.number().int()
  })
});

export const commercialOrderSchema = z.object({
  order_id: z.string(),
  tenant_id: z.string(),
  tenant_name: z.string().nullable(),
  order_no: z.string(),
  plan_key: z.string(),
  amount_cents: z.number().int().nonnegative(),
  currency: z.string(),
  status: z.string(),
  paid_at: z.string().nullable(),
  created_at: z.string()
});

export const quotaLedgerSchema = z.object({
  ledger_id: z.string(),
  tenant_id: z.string(),
  quota_type: z.enum(["member", "card", "video_mb"]),
  delta: z.number().int(),
  reason: z.string(),
  idempotency_key: z.string(),
  created_by: z.string(),
  created_at: z.string()
});

export const tenantCommercialResponseSchema = z.object({
  subscription: tenantSubscriptionSchema,
  orders: z.array(commercialOrderSchema),
  quota_ledger: z.array(quotaLedgerSchema)
});

export const platformCommercialResponseSchema = z.object({
  plans: z.array(commercialPlanSchema),
  subscriptions: z.array(tenantSubscriptionSchema.extend({
    tenant_id: z.string(),
    tenant_name: z.string()
  })),
  orders: z.array(commercialOrderSchema)
});

export const quotaAdjustmentRequestSchema = z.object({
  tenant_id: z.string().min(1),
  quota_type: z.enum(["member", "card", "video_mb"]),
  delta: z.number().int().min(-100000).max(100000),
  reason: z.string().min(3).max(500),
  idempotency_key: z.string().min(8).max(128)
});

export type TenantCommercialResponse = z.infer<typeof tenantCommercialResponseSchema>;
export type PlatformCommercialResponse = z.infer<typeof platformCommercialResponseSchema>;
export type QuotaAdjustmentRequest = z.infer<typeof quotaAdjustmentRequestSchema>;
