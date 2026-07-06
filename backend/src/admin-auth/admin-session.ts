import type { AdminRole } from "../contracts/admin-auth.js";

export interface AdminSession {
  tenantId: string;
  tenantName: string;
  memberIdentityId: string | null;
  openUserid: string;
  role: AdminRole;
}
