import { z } from "zod";

export const bootstrapOwnerInputSchema = z.object({
  tenant_id: z.string().min(1),
  member_identity_id: z.string().min(1).optional(),
  open_userid: z.string().min(1).max(128).optional()
});

export const ownerCreatedSchema = z.object({
  mode: z.literal("owner_created"),
  tenant_id: z.string(),
  role: z.literal("owner"),
  open_userid: z.string(),
  member_identity_id: z.string().nullable()
});

export const claimTokenCreatedSchema = z.object({
  mode: z.literal("claim_token_created"),
  tenant_id: z.string(),
  claim_token: z.string().min(32),
  expires_at: z.string().datetime()
});

export const bootstrapOwnerResultSchema = z.discriminatedUnion("mode", [
  ownerCreatedSchema,
  claimTokenCreatedSchema
]);

export type BootstrapOwnerInput = z.infer<typeof bootstrapOwnerInputSchema>;
export type BootstrapOwnerResult = z.infer<typeof bootstrapOwnerResultSchema>;
