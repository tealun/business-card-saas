import { ForbiddenException } from "@nestjs/common";
import type { AdminRole } from "../contracts/admin-auth.js";

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
