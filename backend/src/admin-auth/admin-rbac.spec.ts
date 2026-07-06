import { ForbiddenException } from "@nestjs/common";
import { adminRoleAtLeast, requireAdminRole } from "./admin-rbac.js";

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
});
