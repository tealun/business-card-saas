import { z } from "zod";

// Platform-managed local enterprise create/rename inputs. member_limit is
// reserved for future WeCom paid-seat limits; null means unlimited for local
// enterprises.
export const createLocalEnterpriseSchema = z.object({
  name: z.string().trim().min(2).max(255),
  member_limit: z.number().int().positive().nullable().optional()
});

export const renameLocalEnterpriseSchema = z.object({
  name: z.string().trim().min(2).max(255)
});

export type CreateLocalEnterpriseInput = z.infer<typeof createLocalEnterpriseSchema>;
export type RenameLocalEnterpriseInput = z.infer<typeof renameLocalEnterpriseSchema>;
