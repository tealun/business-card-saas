import { ForbiddenException } from "@nestjs/common";
import { normalizePlatformAdminRole, type AdminRole, type PlatformAdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "./admin-session.js";

const tenantRoleRank: Record<AdminRole, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  auditor: 1
};

// Platform roles (01_08 matrix) are mapped onto the legacy tenant ladder so the
// pre-M1 call sites (requirePlatformAdminRole(session, "owner" | "admin" | ...))
// keep their meaning until the fine-grained capability-point model lands
// (01_09 §2 defers it to M2+). Coarse M1 mapping: platform_owner→owner;
// ops/engineer→admin; support/finance→operator; auditor→auditor. Legacy
// platform_admins.role='owner' rows/tokens normalize to 'platform_owner'
// (migrate_v1_14 pending).
const platformRoleRank: Record<PlatformAdminRole, number> = {
  platform_owner: tenantRoleRank.owner,
  ops: tenantRoleRank.admin,
  engineer: tenantRoleRank.admin,
  support: tenantRoleRank.operator,
  finance: tenantRoleRank.operator,
  auditor: tenantRoleRank.auditor
};

// Returns the effective platform rank, or null when the role string is not a
// valid platform role (after legacy 'owner' normalization).
export function platformAdminRoleRank(role: AdminSession["role"]): number | null {
  const normalized = normalizePlatformAdminRole(String(role));
  return normalized ? platformRoleRank[normalized] : null;
}

export function adminRoleAtLeast(actual: AdminSession["role"], required: AdminRole): boolean {
  const rank = tenantRoleRank[actual as AdminRole];
  return rank !== undefined && rank >= tenantRoleRank[required];
}

export function requireAdminRole(actual: AdminSession["role"], required: AdminRole): void {
  if (!adminRoleAtLeast(actual, required)) {
    throw new ForbiddenException("admin role does not have permission");
  }
}

export function requirePlatformAdminRole(session: AdminSession, required: AdminRole): void {
  if (session.accountType !== "platform") {
    throw new ForbiddenException("platform administrator required");
  }
  const rank = platformAdminRoleRank(session.role);
  if (rank === null || rank < tenantRoleRank[required]) {
    throw new ForbiddenException("admin role does not have permission");
  }
}

export function requireTenantAdminRole(session: AdminSession, required: AdminRole): void {
  // accountType is optional for backwards compatibility with pre-platform tokens;
  // a missing value is treated as "tenant" (see AdminSessionTokenService.verify).
  if ((session.accountType ?? "tenant") !== "tenant") {
    throw new ForbiddenException("tenant administrator required");
  }
  // A tenant session must carry a tenant role; platform role strings are rejected
  // instead of being silently ranked (01_08 platform role migration contract).
  if (tenantRoleRank[session.role as AdminRole] === undefined) {
    throw new ForbiddenException("admin role does not have permission");
  }
  requireAdminRole(session.role, required);
}
