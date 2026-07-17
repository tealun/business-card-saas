import { ForbiddenException } from "@nestjs/common";
import type { AdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "./admin-session.js";

const roleRank: Record<AdminRole, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  auditor: 1
};

export function adminRoleAtLeast(actual: AdminRole, required: AdminRole): boolean {
  return roleRank[actual] >= roleRank[required];
}

export function requireAdminRole(actual: AdminRole, required: AdminRole): void {
  if (!adminRoleAtLeast(actual, required)) {
    throw new ForbiddenException("admin role does not have permission");
  }
}

export function requirePlatformAdminRole(session: AdminSession, required: AdminRole): void {
  if (session.accountType !== "platform") {
    throw new ForbiddenException("platform administrator required");
  }
  requireAdminRole(session.role, required);
}

export function requireTenantAdminRole(session: AdminSession, required: AdminRole): void {
  // accountType is optional for backwards compatibility with pre-platform tokens;
  // a missing value is treated as "tenant" (see AdminSessionTokenService.verify).
  if ((session.accountType ?? "tenant") !== "tenant") {
    throw new ForbiddenException("tenant administrator required");
  }
  requireAdminRole(session.role, required);
}
