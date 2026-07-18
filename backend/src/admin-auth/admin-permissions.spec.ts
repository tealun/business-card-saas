import type { AdminSession } from "./admin-session.js";
import { adminCapabilities } from "./admin-permissions.js";

describe("adminCapabilities", () => {
  const baseTenantSession: AdminSession = {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-admin",
    role: "owner",
    accountType: "tenant"
  };

  const basePlatformSession: AdminSession = {
    tenantId: "platform-tenant",
    tenantName: "Platform Ops",
    memberIdentityId: null,
    openUserid: "platform:root",
    role: "owner",
    accountType: "platform"
  };

  it("keeps tenant auditors read-only", () => {
    const capabilities = adminCapabilities({ ...baseTenantSession, role: "auditor" });

    expect(capabilities.permissions).toEqual(expect.arrayContaining(["tenant.member.read", "tenant.audit.read"]));
    expect(capabilities.permissions).not.toContain("tenant.member.sync");
    expect(capabilities.permissions).not.toContain("tenant.member.card.write");
    expect(capabilities.menuScopes).toEqual(expect.arrayContaining(["tenant.dashboard", "tenant.audit"]));
  });

  it("allows tenant operators to edit cards without config writes", () => {
    const capabilities = adminCapabilities({ ...baseTenantSession, role: "operator" });

    expect(capabilities.permissions).toContain("tenant.member.card.write");
    expect(capabilities.permissions).not.toContain("tenant.config.write");
    expect(capabilities.permissions).not.toContain("tenant.member.sync");
  });

  it("keeps platform auditors read-only", () => {
    const capabilities = adminCapabilities({ ...basePlatformSession, role: "auditor" });

    expect(capabilities.permissions).toEqual(expect.arrayContaining(["platform.tenant.read", "platform.audit.read"]));
    expect(capabilities.permissions).not.toContain("platform.feature.write");
    expect(capabilities.permissions).not.toContain("platform.database.migrate");
    expect(capabilities.menuScopes).not.toContain("platform.ops");
  });

  it("gives platform owners operations and account scopes", () => {
    const capabilities = adminCapabilities(basePlatformSession);

    expect(capabilities.permissions).toEqual(
      expect.arrayContaining(["platform.feature.write", "platform.database.migrate", "platform.account.write"])
    );
    expect(capabilities.menuScopes).toEqual(expect.arrayContaining(["platform.ops", "platform.accounts"]));
  });
});


describe("platform role capabilities (01_08 matrix, M1 subset)", () => {
  const basePlatform: AdminSession = {
    tenantId: "platform-tenant",
    tenantName: "Platform Ops",
    memberIdentityId: null,
    openUserid: "platform:root",
    role: "platform_owner",
    accountType: "platform"
  };

  it("treats legacy 'owner' exactly like platform_owner", () => {
    const legacy = adminCapabilities({ ...basePlatform, role: "owner" as AdminSession["role"] });
    const current = adminCapabilities(basePlatform);
    expect(legacy).toEqual(current);
    expect(current.permissions).toEqual(
      expect.arrayContaining(["platform.account.read", "platform.account.write", "platform.database.migrate"])
    );
    expect(current.menuScopes).toEqual(expect.arrayContaining(["platform.accounts", "platform.commercial", "platform.ops"]));
  });

  it("gives ops feature writes and the ops console without account management", () => {
    const capabilities = adminCapabilities({ ...basePlatform, role: "ops" });

    expect(capabilities.permissions).toEqual(
      expect.arrayContaining(["platform.feature.write", "platform.ops.read", "platform.database.read"])
    );
    expect(capabilities.permissions).not.toContain("platform.account.write");
    expect(capabilities.permissions).not.toContain("platform.database.migrate");
    expect(capabilities.permissions).not.toContain("platform.commercial.read");
    expect(capabilities.menuScopes).toContain("platform.ops");
    expect(capabilities.menuScopes).not.toContain("platform.accounts");
  });

  it("keeps support read-oriented with commercial read only", () => {
    const capabilities = adminCapabilities({ ...basePlatform, role: "support" });

    expect(capabilities.permissions).toContain("platform.commercial.read");
    expect(capabilities.permissions).not.toContain("platform.commercial.write");
    expect(capabilities.permissions).not.toContain("platform.feature.write");
    expect(capabilities.permissions).not.toContain("platform.account.write");
    expect(capabilities.menuScopes).toContain("platform.commercial");
    expect(capabilities.menuScopes).not.toContain("platform.ops");
  });

  it("fails closed to the read-only base set for unknown role strings", () => {
    const capabilities = adminCapabilities({ ...basePlatform, role: "garbage" as AdminSession["role"] });

    expect(capabilities.permissions).not.toContain("platform.feature.write");
    expect(capabilities.permissions).not.toContain("platform.account.write");
    expect(capabilities.menuScopes).not.toContain("platform.accounts");
    expect(capabilities.menuScopes).toEqual(expect.arrayContaining(["platform.dashboard", "platform.audit"]));
  });
});
