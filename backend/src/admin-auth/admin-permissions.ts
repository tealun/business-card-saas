import type { AdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "./admin-session.js";
import { adminRoleAtLeast } from "./admin-rbac.js";

export interface AdminCapabilities {
  permissions: string[];
  menuScopes: string[];
}

const tenantReadPermissions = [
  "tenant.overview.read",
  "tenant.member.read",
  "tenant.member.card.read",
  "tenant.company.read",
  "tenant.config.read",
  "tenant.sync.read",
  "tenant.analytics.read"
];

const platformReadPermissions = [
  "platform.dashboard.read",
  "platform.tenant.read",
  "platform.tenant.authorization.read",
  "platform.feature.read",
  "platform.audit.read"
];

export function adminCapabilities(session: AdminSession): AdminCapabilities {
  return session.accountType === "platform"
    ? platformCapabilities(session.role)
    : tenantCapabilities(session.role);
}

export function adminMenuScopes(session: AdminSession): string[] {
  return adminCapabilities(session).menuScopes;
}

export function adminPermissions(session: AdminSession): string[] {
  return adminCapabilities(session).permissions;
}

function tenantCapabilities(role: AdminRole): AdminCapabilities {
  const permissions = new Set<string>(tenantReadPermissions);
  const menuScopes = new Set<string>([
    "tenant.dashboard",
    "tenant.members",
    "tenant.company",
    "tenant.design",
    "tenant.sync",
    "tenant.analytics"
  ]);

  if (adminRoleAtLeast(role, "operator")) {
    permissions.add("tenant.member.card.write");
  }

  if (adminRoleAtLeast(role, "admin")) {
    [
      "tenant.member.sync",
      "tenant.sync.retry",
      "tenant.company.write",
      "tenant.config.write",
      "tenant.template.write"
    ].forEach((permission) => permissions.add(permission));
  }

  if (role === "owner" || role === "admin" || role === "auditor") {
    permissions.add("tenant.commercial.read");
    permissions.add("tenant.audit.read");
    menuScopes.add("tenant.billing");
    menuScopes.add("tenant.audit");
  }

  if (role === "owner") {
    permissions.add("tenant.admin.read");
    permissions.add("tenant.admin.write");
    menuScopes.add("tenant.admins");
  }

  return sortedCapabilities(permissions, menuScopes);
}

function platformCapabilities(role: AdminRole): AdminCapabilities {
  const permissions = new Set<string>(platformReadPermissions);
  const menuScopes = new Set<string>([
    "platform.dashboard",
    "platform.tenants",
    "platform.wecom",
    "platform.features",
    "platform.audit"
  ]);

  if (adminRoleAtLeast(role, "admin")) {
    [
      "platform.feature.write",
      "platform.database.read",
      "platform.ops.read"
    ].forEach((permission) => permissions.add(permission));
    menuScopes.add("platform.ops");
  }

  if (role === "owner") {
    [
      "platform.database.migrate",
      "platform.commercial.read",
      "platform.commercial.write",
      "platform.account.read",
      "platform.account.write"
    ].forEach((permission) => permissions.add(permission));
    menuScopes.add("platform.commercial");
    menuScopes.add("platform.accounts");
  }

  return sortedCapabilities(permissions, menuScopes);
}

function sortedCapabilities(permissions: Set<string>, menuScopes: Set<string>): AdminCapabilities {
  return {
    permissions: [...permissions].sort(),
    menuScopes: [...menuScopes].sort()
  };
}
