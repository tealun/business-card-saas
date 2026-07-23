import { z } from "zod";

export const createLocalEnterpriseSchema = z.object({ name: z.string().trim().min(2).max(255) });
export const createLocalEnterpriseAdminSessionSchema = z.object({ tenant_id: z.string().regex(/^\d+$/) });
export const createMemberInvitationSchema = z.object({ display_name: z.string().trim().min(1).max(128) });
export const acceptMemberInvitationSchema = z.object({ invitation_token: z.string().min(32).max(256) });
export const submitJoinRequestSchema = z.object({ join_token: z.string().min(32).max(256), display_name: z.string().trim().min(1).max(128) });
export const claimLocalEnterpriseSchema = z.object({
  claim_token: z
    .string()
    .trim()
    .refine((value) => /^[A-Za-z0-9]{8}$/.test(value) || /^admclaim_[A-Za-z0-9_-]{32}$/.test(value), {
      message: "claim_token must be an 8 character claim code or a full admclaim token"
    }),
  display_name: z.string().trim().min(1).max(128).optional()
});
export const reviewJoinRequestSchema = z.object({ decision: z.enum(["approved","rejected"]) });
export const localAdminScanConfirmSchema = z.object({ challenge_token:z.string().length(32),tenant_id:z.string().regex(/^\d+$/).optional() });
export type CreateLocalEnterprise = z.infer<typeof createLocalEnterpriseSchema>;
export type CreateLocalEnterpriseAdminSession = z.infer<typeof createLocalEnterpriseAdminSessionSchema>;
export type CreateMemberInvitation = z.infer<typeof createMemberInvitationSchema>;
