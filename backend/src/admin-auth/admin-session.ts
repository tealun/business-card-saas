import type { AdminRole } from "../contracts/admin-auth.js";

export interface AdminSession {
  tenantId: string;
  tenantName: string;
  memberIdentityId: string | null;
  openUserid: string;
  role: AdminRole;
  accountType?: "tenant" | "platform";
  // Attached per request by AdminAuthGuard (never signed into the session token);
  // only used for admin operation audit logging.
  requestIp?: string | undefined;
}
