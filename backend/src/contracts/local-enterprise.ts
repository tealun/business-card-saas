import { z } from "zod";

export const createLocalEnterpriseSchema = z.object({ name: z.string().trim().min(2).max(255) });
export const createLocalEnterpriseAdminSessionSchema = z.object({ tenant_id: z.string().regex(/^\d+$/) });
export const createMemberInvitationSchema = z.object({ display_name: z.string().trim().min(1).max(128) });
export const acceptMemberInvitationSchema = z.object({ invitation_token: z.string().min(32).max(256) });
export const submitJoinRequestSchema = z.object({ join_token: z.string().min(32).max(256), display_name: z.string().trim().min(1).max(128) });
export const reviewJoinRequestSchema = z.object({ decision: z.enum(["approved","rejected"]) });
export type CreateLocalEnterprise = z.infer<typeof createLocalEnterpriseSchema>;
export type CreateLocalEnterpriseAdminSession = z.infer<typeof createLocalEnterpriseAdminSessionSchema>;
export type CreateMemberInvitation = z.infer<typeof createMemberInvitationSchema>;
