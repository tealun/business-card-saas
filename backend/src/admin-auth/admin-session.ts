import type { AdminRole, PlatformAdminRole } from "../contracts/admin-auth.js";

export interface AdminSession {
  tenantId: string;
  tenantName: string;
  memberIdentityId: string | null;
  openUserid: string;
  // Tenant sessions carry AdminRole; platform sessions carry PlatformAdminRole
  // (legacy pre-migrate_v1_14 tokens/rows may still say 'owner', normalized on read).
  role: AdminRole | PlatformAdminRole;
  accountType?: "tenant" | "platform";
  // Attached per request by AdminAuthGuard (never signed into the session token);
  // only used for admin operation audit logging.
  requestIp?: string | undefined;
}
