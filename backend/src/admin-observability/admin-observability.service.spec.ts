import { ForbiddenException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminObservabilityService } from "./admin-observability.service.js";

describe("AdminObservabilityService", () => {
  const tenantOwner = {
    accountType: "tenant",
    tenantId: "1",
    tenantName: "Pilot Corp",
    memberIdentityId: "10",
    openUserid: "ou-owner",
    role: "owner"
  } satisfies AdminSession;

  const tenantAdmin = { ...tenantOwner, role: "admin" } satisfies AdminSession;
  const platformOwner = {
    accountType: "platform",
    tenantId: "0",
    tenantName: "Platform",
    memberIdentityId: null,
    openUserid: "platform:root",
    role: "owner"
  } satisfies AdminSession;

  it("lists tenant admins only for tenant owners", async () => {
    const repository = {
      listTenantAdmins: jest.fn().mockResolvedValue({ items: [], total: 0 })
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.listTenantAdmins(tenantOwner, { status: "all", search: "" })).resolves.toEqual({
      items: [],
      total: 0
    });
    await expect(service.listTenantAdmins(tenantAdmin, { status: "all", search: "" })).rejects.toThrow(
      ForbiddenException
    );
  });

  it("lists platform accounts only for platform owners", async () => {
    const repository = {
      listPlatformAdmins: jest.fn().mockResolvedValue({ items: [], total: 0 })
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.listPlatformAdmins(platformOwner, { status: "all", search: "" })).resolves.toEqual({
      items: [],
      total: 0
    });
    await expect(service.listPlatformAdmins(tenantOwner, { status: "all", search: "" })).rejects.toThrow(
      "platform administrator required"
    );
  });

  it("allows tenant auditors to read tenant audit events", async () => {
    const repository = {
      listTenantEvents: jest.fn().mockResolvedValue({ items: [], total: 0 })
    };
    const service = new AdminObservabilityService(repository as never);
    const auditor = { ...tenantOwner, role: "auditor" } satisfies AdminSession;

    await expect(service.listTenantAuditEvents(auditor, { status: "all", source: "all", search: "" })).resolves.toEqual(
      { items: [], total: 0 }
    );
  });

  it("rejects tenant operators from audit events", async () => {
    const repository = {
      listTenantEvents: jest.fn().mockResolvedValue({ items: [], total: 0 })
    };
    const service = new AdminObservabilityService(repository as never);
    const operator = { ...tenantOwner, role: "operator" } satisfies AdminSession;

    await expect(service.listTenantAuditEvents(operator, { status: "all", source: "all", search: "" })).rejects.toThrow(
      ForbiddenException
    );
  });
});
