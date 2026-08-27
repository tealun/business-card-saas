import { z } from "zod";
import { publicIdSchema } from "./public-card.js";

export const exchangeStatusSchema = z.enum(["pending", "accepted", "ignored"]);

export const exchangeCardSnapshotSchema = z.object({
  public_id: publicIdSchema,
  display_name: z.string(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  avatar_url: z.string().nullable()
});

export const createExchangeRequestSchema = z.object({
  recipient_public_id: publicIdSchema,
  visit_token: z.string().min(20)
});

export const exchangeRequestSchema = z.object({
  request_id: z.string(),
  direction: z.enum(["incoming", "outgoing"]),
  status: exchangeStatusSchema,
  unread: z.boolean(),
  counterpart: exchangeCardSnapshotSchema,
  created_at: z.string(),
  responded_at: z.string().nullable()
});

export const exchangeListResponseSchema = z.object({
  unread_count: z.number().int().nonnegative(),
  pending_count: z.number().int().nonnegative(),
  requests: z.array(exchangeRequestSchema)
});

export const exchangeMutationResponseSchema = z.object({
  request: exchangeRequestSchema,
  idempotent: z.boolean()
});

export type CreateExchangeRequest = z.infer<typeof createExchangeRequestSchema>;
export type ExchangeCardSnapshot = z.infer<typeof exchangeCardSnapshotSchema>;
export type ExchangeRequestItem = z.infer<typeof exchangeRequestSchema>;
export type ExchangeListResponse = z.infer<typeof exchangeListResponseSchema>;
export type ExchangeMutationResponse = z.infer<typeof exchangeMutationResponseSchema>;
