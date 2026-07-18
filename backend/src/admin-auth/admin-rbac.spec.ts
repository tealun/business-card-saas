import { ForbiddenException } from "@nestjs/common";
import { adminRoleAtLeast, requireAdminRole, requirePlatformAdminRole, requireTenantAdminRole } from "./admin-rbac.js";
import type { AdminSession } from "./admin-session.js";

describe("admin RBAC helpers", () => {
  it("orders tenant admin roles by privilege", () => {
    expect(adminRoleAtLeast("owner", "auditor")).toBe(true);
    expect(adminRoleAtLeast("admin", "operator")).toBe(true);
    expect(adminRoleAtLeast("operator", "admin")).toBe(false);
    expect(adminRoleAtLeast("auditor", "operator")).toBe(false);
  });

  it("throws when a role is below the required privilege", () => {
    expect(() => requireAdminRole("auditor", "operator")).toThrow(ForbiddenException);
    expect(() => requireAdminRole("owner", "admin")).not.toThrow();
  });

  it("requires both platform account type and sufficient role for platform operations", () => {
    const platformOwner = {
      tenantId: "1",
      tenantName: "平台",
      memberIdentityId: null,
      openUserid: "platform:root",
      role: "owner",
      accountType: "platform"
    } satisfies AdminSession;
    const tenantOwner = { ...platformOwner, openUserid: "ou-owner", accountType: "tenant" } satisfies AdminSession;
    const platformAuditor = { ...platformOwner, role: "auditor" } satisfies AdminSession;

    expect(() => requirePlatformAdminRole(platformOwner, "admin")).not.toThrow();
    expect(() => requirePlatformAdminRole(tenantOwner, "admin")).toThrow("platform administrator required");
    expect(() => requirePlatformAdminRole(platformAuditor, "admin")).toThrow("admin role does not have permission");
  });

  it("requires tenant account type and treats legacy tokens without accountType as tenant", () => {
    const legacyOwner = {
      tenantId: "1",
      tenantName: "企业",
      memberIdentityId: null,
      openUserid: "ou-owner",
      role: "owner"
    } satisfies AdminSession;
    const tenantAdmin = { ...legacyOwner, role: "admin", accountType: "tenant" } satisfies AdminSession;
    const tenantAuditor = { ...tenantAdmin, role: "auditor" } satisfies AdminSession;
    const platformOwner = { ...legacyOwner, openUserid: "platform:root", accountType: "platform" } satisfies AdminSession;

    expect(() => requireTenantAdminRole(legacyOwner, "owner")).not.toThrow();
    expect(() => requireTenantAdminRole(tenantAdmin, "admin")).not.toThrow();
    expect(() => requireTenantAdminRole(tenantAuditor, "admin")).toThrow("admin role does not have permission");
    expect(() => requireTenantAdminRole(platformOwner, "owner")).toThrow("tenant administrator required");
  });
});


describe("platform role mapping (01_08 matrix, migrate_v1_14 compat)", () => {
  const base = {
    tenantId: "1",
    tenantName: "平台",
    memberIdentityId: null,
    openUserid: "platform:root",
    accountType: "platform"
  } satisfies Omit<AdminSession, "role">;

  it("treats legacy 'owner' platform sessions as platform_owner", () => {
    expect(() => requirePlatformAdminRole({ ...base, role: "owner" }, "owner")).not.toThrow();
    expect(() => requirePlatformAdminRole({ ...base, role: "platform_owner" }, "owner")).not.toThrow();
  });

  it("ranks ops at admin level but below platform_owner", () => {
    expect(() => requirePlatformAdminRole({ ...base, role: "ops" }, "admin")).not.toThrow();
    expect(() => requirePlatformAdminRole({ ...base, role: "ops" }, "owner")).toThrow(ForbiddenException);
  });

  it("ranks support at operator level and auditor at read-only level", () => {
    expect(() => requirePlatformAdminRole({ ...base, role: "support" }, "operator")).not.toThrow();
    expect(() => requirePlatformAdminRole({ ...base, role: "support" }, "admin")).toThrow(ForbiddenException);
    expect(() => requirePlatformAdminRole({ ...base, role: "auditor" }, "auditor")).not.toThrow();
    expect(() => requirePlatformAdminRole({ ...base, role: "auditor" }, "operator")).toThrow(ForbiddenException);
  });

  it("rejects unknown or tenant-only role strings on platform sessions", () => {
    expect(() => requirePlatformAdminRole({ ...base, role: "admin" }, "auditor")).toThrow(ForbiddenException);
    expect(() => requirePlatformAdminRole({ ...base, role: "garbage" as never }, "auditor")).toThrow(ForbiddenException);
  });

  it("rejects platform role strings on tenant sessions", () => {
    const tenantBase = { ...base, openUserid: "ou-owner", accountType: "tenant" } satisfies Omit<AdminSession, "role">;
    expect(() => requireTenantAdminRole({ ...tenantBase, role: "platform_owner" }, "auditor")).toThrow(
      ForbiddenException
    );
    expect(() => requireTenantAdminRole({ ...tenantBase, role: "ops" }, "auditor")).toThrow(ForbiddenException);
    expect(() => requireTenantAdminRole({ ...tenantBase, role: "owner" }, "owner")).not.toThrow();
  });
});
