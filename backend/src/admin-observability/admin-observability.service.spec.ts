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
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

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
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

    await expect(service.listPlatformAdmins(platformOwner, { status: "all", search: "" })).resolves.toEqual({
      items: [],
      total: 0
    });
    await expect(service.listPlatformAdmins(tenantOwner, { status: "all", search: "" })).rejects.toThrow(
      "platform administrator required"
    );
  });

  it("updates platform account status with bootstrap and self protections plus audit logging", async () => {
    const repository = {
      updatePlatformAdminStatus: jest.fn().mockResolvedValue({
        admin_id: "5",
        username: "ops.one",
        role: "ops",
        status: "disabled",
        password_updated_at: null,
        created_at: "2026-07-17T00:00:00.000Z",
        updated_at: "2026-07-18T00:00:00.000Z"
      })
    };
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue({
        id: "5",
        username: "ops.one",
        passwordHash: "scrypt:x",
        tenantId: "0",
        tenantName: "Platform",
        role: "ops",
        status: "active"
      })
    });
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminObservabilityService(repository as never, platformAdmins as never, operationLogs as never);

    await expect(service.updatePlatformAdminStatus(platformOwner, "5", "disabled")).resolves.toMatchObject({
      admin_id: "5",
      status: "disabled"
    });
    expect(repository.updatePlatformAdminStatus).toHaveBeenCalledWith("5", "disabled", ["root"]);
    expect(operationLogs.record).toHaveBeenCalledWith({
      session: platformOwner,
      action: "platform.account.status.update",
      targetType: "platform_admin",
      targetId: "5",
      detail: { status: "disabled" }
    });
  });

  it("forbids changing the current platform account or built-in owner status", async () => {
    const repository = {
      updatePlatformAdminStatus: jest.fn()
    };
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue({
        id: "1",
        username: "root",
        passwordHash: "scrypt:x",
        tenantId: "0",
        tenantName: "Platform",
        role: "platform_owner",
        status: "active"
      })
    });
    const service = new AdminObservabilityService(repository as never, platformAdmins as never);

    await expect(service.updatePlatformAdminStatus(platformOwner, "1", "disabled")).rejects.toThrow(
      "不能修改当前登录账号状态"
    );

    const otherOwner = { ...platformOwner, openUserid: "platform:other" } satisfies AdminSession;
    await expect(service.updatePlatformAdminStatus(otherOwner, "1", "disabled")).rejects.toThrow(
      "内置平台 Owner 账号禁止启停"
    );
    expect(repository.updatePlatformAdminStatus).not.toHaveBeenCalled();
  });

  it("allows tenant auditors to read tenant audit events", async () => {
    const repository = {
      listTenantEvents: jest.fn().mockResolvedValue({ items: [], total: 0 })
    };
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);
    const auditor = { ...tenantOwner, role: "auditor" } satisfies AdminSession;

    await expect(service.listTenantAuditEvents(auditor, { status: "all", source: "all", search: "" })).resolves.toEqual(
      { items: [], total: 0 }
    );
  });

  it("rejects tenant operators from audit events", async () => {
    const repository = {
      listTenantEvents: jest.fn().mockResolvedValue({ items: [], total: 0 })
    };
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);
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
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

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

  it("records an operation log after changing a tenant admin status", async () => {
    const target = tenantAdminRow();
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(target),
      updateTenantAdminStatus: jest
        .fn()
        .mockResolvedValue({ ...target, status: "disabled", updated_at: "2026-07-02T00:00:00.000Z" })
    };
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never, operationLogs as never);

    await service.updateTenantAdminStatus(tenantOwner, "2", "disabled");

    expect(operationLogs.record).toHaveBeenCalledWith({
      session: tenantOwner,
      action: "admin.status.update",
      targetType: "tenant_admin",
      targetId: "2",
      detail: { status: "disabled" }
    });
  });

  it("rejects admin status updates from non-owners and platform sessions", async () => {
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(tenantAdminRow()),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

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
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

    await expect(service.updateTenantAdminStatus(tenantOwner, "1", "disabled")).rejects.toThrow(ForbiddenException);
    expect(repository.updateTenantAdminStatus).not.toHaveBeenCalled();
  });

  it("rejects status changes on owner admin rows", async () => {
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(tenantAdminRow({ role: "owner", open_userid: "ou-other-owner" })),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

    await expect(service.updateTenantAdminStatus(tenantOwner, "2", "disabled")).rejects.toThrow(ForbiddenException);
    expect(repository.updateTenantAdminStatus).not.toHaveBeenCalled();
  });

  it("returns 404 when the target tenant admin does not exist", async () => {
    const repository = {
      getTenantAdmin: jest.fn().mockResolvedValue(null),
      updateTenantAdminStatus: jest.fn()
    };
    const service = new AdminObservabilityService(repository as never, platformAdminsStub() as never);

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


describe("AdminObservabilityService platform account management (M1-S4)", () => {
  const platformOwnerSession = {
    accountType: "platform",
    tenantId: "0",
    tenantName: "Platform",
    memberIdentityId: null,
    openUserid: "platform:root",
    // Legacy pre-migrate_v1_14 value on purpose: must be treated as platform_owner.
    role: "owner"
  } satisfies AdminSession;

  const platformOpsSession = { ...platformOwnerSession, openUserid: "platform:ops.one", role: "ops" } satisfies AdminSession;
  const tenantOwnerSession = {
    accountType: "tenant",
    tenantId: "1",
    tenantName: "Pilot Corp",
    memberIdentityId: "10",
    openUserid: "ou-owner",
    role: "owner"
  } satisfies AdminSession;

  function summary(overrides: Record<string, unknown> = {}) {
    return {
      admin_id: "5",
      username: "ops.two",
      role: "ops",
      status: "active",
      password_updated_at: null,
      created_at: "2026-07-17T00:00:00.000Z",
      updated_at: "2026-07-17T00:00:00.000Z",
      ...overrides
    };
  }

  function record(overrides: Record<string, unknown> = {}) {
    return {
      id: "5",
      username: "ops.two",
      passwordHash: "scrypt:x",
      tenantId: "0",
      tenantName: "Platform",
      role: "ops",
      status: "active",
      ...overrides
    };
  }

  it("creates accounts as platform_owner, tags created_by with the operator and audits the write", async () => {
    const platformAdmins = platformAdminsStub({
      createPlatformAccount: jest.fn().mockResolvedValue(summary())
    });
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminObservabilityService({} as never, platformAdmins as never, operationLogs as never);

    const result = await service.createPlatformAccount(platformOwnerSession, {
      username: "ops.two",
      password: "password-001",
      role: "ops"
    });

    expect(result).toMatchObject({ admin_id: "5", username: "ops.two", role: "ops" });
    expect(platformAdmins.createPlatformAccount).toHaveBeenCalledWith({
      username: "ops.two",
      password: "password-001",
      role: "ops",
      createdBy: "root"
    });
    expect(operationLogs.record).toHaveBeenCalledWith({
      session: platformOwnerSession,
      action: "platform.account.create",
      targetType: "platform_admin",
      targetId: "5",
      detail: { username: "ops.two", role: "ops" }
    });
  });

  it("rejects account creation from non-owner platform roles and tenant sessions", async () => {
    const platformAdmins = platformAdminsStub();
    const service = new AdminObservabilityService({} as never, platformAdmins as never, undefined);

    await expect(
      service.createPlatformAccount(platformOpsSession, { username: "x", password: "password-001", role: "ops" })
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.createPlatformAccount(tenantOwnerSession, { username: "x", password: "password-001", role: "ops" })
    ).rejects.toThrow("platform administrator required");
    expect(platformAdmins.createPlatformAccount).not.toHaveBeenCalled();
  });

  it("updates roles and audits the change", async () => {
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue(record()),
      updateAccountRole: jest.fn().mockResolvedValue(summary({ role: "support" }))
    });
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminObservabilityService({} as never, platformAdmins as never, operationLogs as never);

    const result = await service.updatePlatformAccountRole(platformOwnerSession, "5", "support");

    expect(result.role).toBe("support");
    expect(platformAdmins.updateAccountRole).toHaveBeenCalledWith("5", "support", ["root"]);
    expect(operationLogs.record).toHaveBeenCalledWith({
      session: platformOwnerSession,
      action: "platform.account.role.update",
      targetType: "platform_admin",
      targetId: "5",
      detail: { username: "ops.two", role: "support" }
    });
  });

  it("forbids role changes on the built-in owner account and unknown ids", async () => {
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue(record({ username: "root", role: "platform_owner" }))
    });
    const service = new AdminObservabilityService({} as never, platformAdmins as never, undefined);

    await expect(service.updatePlatformAccountRole(platformOwnerSession, "1", "ops")).rejects.toThrow(
      "内置平台 Owner 账号禁止修改角色"
    );
    expect(platformAdmins.updateAccountRole).not.toHaveBeenCalled();

    platformAdmins.getAccountById.mockResolvedValue(null);
    await expect(service.updatePlatformAccountRole(platformOwnerSession, "404", "ops")).rejects.toThrow(
      NotFoundException
    );
  });

  it("returns a conflict when the guarded role update loses a race", async () => {
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue(record()),
      updateAccountRole: jest.fn().mockResolvedValue(null)
    });
    const service = new AdminObservabilityService({} as never, platformAdmins as never, undefined);

    await expect(service.updatePlatformAccountRole(platformOwnerSession, "5", "ops")).rejects.toThrow(
      "平台账号状态已变化，请刷新后重试"
    );
  });

  it("deletes accounts and audits the deletion with the target snapshot", async () => {
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue(record()),
      deleteAccount: jest.fn().mockResolvedValue(true)
    });
    const operationLogs = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminObservabilityService({} as never, platformAdmins as never, operationLogs as never);

    await expect(service.deletePlatformAccount(platformOwnerSession, "5")).resolves.toEqual({ deleted: true });
    expect(platformAdmins.deleteAccount).toHaveBeenCalledWith("5", ["root"]);
    expect(operationLogs.record).toHaveBeenCalledWith({
      session: platformOwnerSession,
      action: "platform.account.delete",
      targetType: "platform_admin",
      targetId: "5",
      detail: { username: "ops.two", role: "ops" }
    });
  });

  it("forbids deleting yourself and the built-in owner account", async () => {
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue(record({ username: "root", role: "platform_owner" }))
    });
    const service = new AdminObservabilityService({} as never, platformAdmins as never, undefined);

    // Target username matches the signed-in operator.
    await expect(service.deletePlatformAccount(platformOwnerSession, "1")).rejects.toThrow("不能删除当前登录的账号");

    // A different operator still cannot delete the bootstrap account.
    const otherOwner = { ...platformOwnerSession, openUserid: "platform:other" } satisfies AdminSession;
    await expect(service.deletePlatformAccount(otherOwner, "1")).rejects.toThrow("内置平台 Owner 账号禁止删除");
    expect(platformAdmins.deleteAccount).not.toHaveBeenCalled();
  });

  it("returns a conflict when the guarded delete loses a race", async () => {
    const platformAdmins = platformAdminsStub({
      getAccountById: jest.fn().mockResolvedValue(record()),
      deleteAccount: jest.fn().mockResolvedValue(false)
    });
    const service = new AdminObservabilityService({} as never, platformAdmins as never, undefined);

    await expect(service.deletePlatformAccount(platformOwnerSession, "5")).rejects.toThrow(
      "平台账号状态已变化，请刷新后重试"
    );
  });
});

function platformAdminsStub(overrides: Record<string, unknown> = {}) {
  return {
    createPlatformAccount: jest.fn(),
    getAccountById: jest.fn().mockResolvedValue(null),
    updateAccountRole: jest.fn().mockResolvedValue(null),
    deleteAccount: jest.fn().mockResolvedValue(false),
    getBootstrapUsername: jest.fn().mockReturnValue("root"),
    ...overrides
  };
}
