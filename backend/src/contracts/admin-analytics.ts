import { z } from "zod";

export const adminAnalyticsQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => value === 7 || value === 30, { message: "days must be 7 or 30" })
    .optional()
    .default(7)
});

export const adminAnalyticsOverviewSchema = z.object({
  visit_count: z.number().int().nonnegative(),
  visitor_count: z.number().int().nonnegative(),
  action_count: z.number().int().nonnegative(),
  share_count: z.number().int().nonnegative(),
  active_card_count: z.number().int().nonnegative()
});

export const adminAnalyticsTrendPointSchema = z.object({
  date: z.string(),
  visit_count: z.number().int().nonnegative(),
  action_count: z.number().int().nonnegative()
});

export const adminAnalyticsMemberRankSchema = z.object({
  member_identity_id: z.string(),
  display_name: z.string(),
  public_id: z.string().nullable(),
  visit_count: z.number().int().nonnegative(),
  visitor_count: z.number().int().nonnegative(),
  action_count: z.number().int().nonnegative()
});

export const adminAnalyticsActionTypeSchema = z.object({
  action_type: z.string(),
  action_count: z.number().int().nonnegative()
});

export const adminAnalyticsResponseSchema = z.object({
  overview: adminAnalyticsOverviewSchema,
  trend: z.array(adminAnalyticsTrendPointSchema),
  member_rank: z.array(adminAnalyticsMemberRankSchema),
  action_types: z.array(adminAnalyticsActionTypeSchema)
});

export type AdminAnalyticsResponse = z.infer<typeof adminAnalyticsResponseSchema>;
export type AdminAnalyticsQuery = z.infer<typeof adminAnalyticsQuerySchema>;
