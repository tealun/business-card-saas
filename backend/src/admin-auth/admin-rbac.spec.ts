import { ForbiddenException } from "@nestjs/common";
import { adminRoleAtLeast, requireAdminRole, requirePlatformAdminRole } from "./admin-rbac.js";
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
});
