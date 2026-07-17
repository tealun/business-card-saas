import { ForbiddenException, Logger } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AdminOperationLogService } from "./admin-operation-log.service.js";

describe("AdminOperationLogService", () => {
  const tenantOwner = {
    accountType: "tenant",
    tenantId: "1",
    tenantName: "Pilot Corp",
    memberIdentityId: "10",
    openUserid: "ou-owner",
    role: "owner"
  } satisfies AdminSession;

  const platformAdmin = {
    accountType: "platform",
    tenantId: "0",
    tenantName: "Platform",
    memberIdentityId: null,
    openUserid: "platform:root",
    role: "admin"
  } satisfies AdminSession;

  it("records an entry with actor fields derived from the session", async () => {
    const repository = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminOperationLogService(repository as never);

    await service.record({
      session: { ...tenantOwner, requestIp: "203.0.113.10" },
      action: "member.card.update",
      targetType: "member_identity",
      targetId: 42,
      detail: { status: "disabled" }
    });

    expect(repository.insert).toHaveBeenCalledWith({
      tenantId: "1",
      actorAdminId: "10",
      actorOpenUserid: "ou-owner",
      actorName: null,
      actorRole: "owner",
      accountType: "tenant",
      action: "member.card.update",
      targetType: "member_identity",
      targetId: "42",
      detail: { status: "disabled" },
      ip: "203.0.113.10"
    });
  });

  it("stores null actor ids when the session has no numeric member identity", async () => {
    const repository = { insert: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminOperationLogService(repository as never);
    const legacySession: AdminSession = {
      tenantId: "2",
      tenantName: "Legacy Corp",
      memberIdentityId: "member-001",
      openUserid: "ou-legacy",
      role: "admin"
    };

    await service.record({ session: legacySession, action: "member.sync" });

    expect(repository.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorAdminId: null,
        accountType: "tenant",
        targetType: null,
        targetId: null,
        detail: null,
        ip: null
      })
    );
  });

  it("does not throw on repository failure, but logs it so a broken audit trail is observable", async () => {
    const repository = { insert: jest.fn().mockRejectedValue(new Error("db down")) };
    const service = new AdminOperationLogService(repository as never);
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    await expect(service.record({ session: tenantOwner, action: "member.sync" })).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: "member.sync", err: "db down" }),
      "admin operation log write failed"
    );
    warnSpy.mockRestore();
  });

  it("lets tenant owners, admins and auditors read tenant logs", async () => {
    const repository = { listTenantLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const service = new AdminOperationLogService(repository as never);
    const query = { action: "", search: "", limit: 50, offset: 0 };

    for (const role of ["owner", "admin", "auditor"] as const) {
      await expect(service.listTenantLogs({ ...tenantOwner, role }, query)).resolves.toEqual({ items: [], total: 0 });
    }
    expect(repository.listTenantLogs).toHaveBeenCalledWith("1", query);
  });

  it("rejects tenant operators and platform sessions from tenant logs", async () => {
    const repository = { listTenantLogs: jest.fn() };
    const service = new AdminOperationLogService(repository as never);
    const query = { action: "", search: "", limit: 50, offset: 0 };

    await expect(service.listTenantLogs({ ...tenantOwner, role: "operator" }, query)).rejects.toThrow(
      ForbiddenException
    );
    await expect(service.listTenantLogs(platformAdmin, query)).rejects.toThrow("tenant administrator required");
    expect(repository.listTenantLogs).not.toHaveBeenCalled();
  });

  it("lets platform auditors read cross-tenant logs and rejects tenant sessions", async () => {
    const repository = { listPlatformLogs: jest.fn().mockResolvedValue({ items: [], total: 0 }) };
    const service = new AdminOperationLogService(repository as never);
    const query = { action: "", search: "", limit: 50, offset: 0 };
    const platformAuditor = { ...platformAdmin, role: "auditor" } satisfies AdminSession;

    await expect(service.listPlatformLogs(platformAuditor, query)).resolves.toEqual({ items: [], total: 0 });
    expect(repository.listPlatformLogs).toHaveBeenCalledWith(query);
    await expect(service.listPlatformLogs(tenantOwner, query)).rejects.toThrow("platform administrator required");
  });
});
