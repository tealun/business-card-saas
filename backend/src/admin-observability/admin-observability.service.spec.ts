import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type { TenantAdminSummary } from "../contracts/admin-observability.js";
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

  it("lets tenant owners disable and restore non-owner admins", async () => {
    const target = tenantAdminRow();
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(target),
      updateTenantAdminStatus: jest
        .fn()
        .mockImplementation(async (_session: AdminSession, _adminId: string, status: "active" | "disabled") => ({
          ...target,
          status,
          updated_at: "2026-07-02T00:00:00.000Z"
        }))
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.updateTenantAdminStatus(tenantOwner, "2", "disabled")).resolves.toMatchObject({
      admin_id: "2",
      status: "disabled"
    });
    await expect(service.updateTenantAdminStatus(tenantOwner, "2", "active")).resolves.toMatchObject({
      admin_id: "2",
      status: "active"
    });
    expect(repository.updateTenantAdminStatus).toHaveBeenCalledWith(tenantOwner, "2", "disabled");
    expect(repository.updateTenantAdminStatus).toHaveBeenCalledWith(tenantOwner, "2", "active");
  });

  it("rejects admin status updates from non-owners and platform sessions", async () => {
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(tenantAdminRow()),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.updateTenantAdminStatus(tenantAdmin, "2", "disabled")).rejects.toThrow(ForbiddenException);
    await expect(service.updateTenantAdminStatus(platformOwner, "2", "disabled")).rejects.toThrow(
      "tenant administrator required"
    );
    expect(repository.getTenantAdmin).not.toHaveBeenCalled();
  });

  it("rejects changing the signed-in admin's own status", async () => {
    const repository = {
      getTenantAdmin: jest
        .fn()
        .mockResolvedValue(tenantAdminRow({ admin_id: "1", member_identity_id: "10", open_userid: "ou-owner" })),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.updateTenantAdminStatus(tenantOwner, "1", "disabled")).rejects.toThrow(ForbiddenException);
    expect(repository.updateTenantAdminStatus).not.toHaveBeenCalled();
  });

  it("rejects status changes on owner admin rows", async () => {
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(tenantAdminRow({ role: "owner", open_userid: "ou-other-owner" })),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.updateTenantAdminStatus(tenantOwner, "2", "disabled")).rejects.toThrow(ForbiddenException);
    expect(repository.updateTenantAdminStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when the target tenant admin does not exist", async () => {
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(null),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never);

    await expect(service.updateTenantAdminStatus(tenantOwner, "missing", "disabled")).rejects.toThrow(
      NotFoundException
    );
  });
});

function tenantAdminRow(overrides: Partial<TenantAdminSummary> = {}): TenantAdminSummary {
  return {
    admin_id: "2",
    member_identity_id: "20",
    display_name: "Admin Two",
    open_userid: "ou-admin",
    userid: "admin-two",
    role: "admin",
    status: "active",
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}
