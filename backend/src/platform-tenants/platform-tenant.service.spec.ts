import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { PlatformTenantService } from "./platform-tenant.service.js";

const platformSession = {
  tenantId: "1",
  tenantName: "平台",
  memberIdentityId: null,
  openUserid: "platform:root",
  role: "owner",
  accountType: "platform"
} satisfies AdminSession;

const tenantSession = { ...platformSession, tenantId: "2", accountType: "tenant" } satisfies AdminSession;

const listItem = {
  tenantId: "2",
  name: "测试企业",
  creationSource: "wecom" as const,
  openCorpid: "wwcorp001",
  authStatus: "active",
  status: "active" as const,
  memberLimit: null,
  agentId: "100001",
  authorizedAt: new Date("2026-07-16T01:00:00.000Z"),
  updatedAt: new Date("2026-07-16T02:00:00.000Z"),
  memberCount: 3,
  activeMemberCount: 2,
  cardCount: 3,
  activeCardCount: 2,
  permanentCodeConfigured: true
};

function createRepository() {
  return {
    list: jest.fn(async () => ({ items: [listItem], total: 1 })),
    summary: jest.fn(async () => ({ localCount: 0, activeCount: 1, cancelledCount: 0, unhealthyCount: 0 })),
    getById: jest.fn(async (tenantId: string) => tenantId === "2" ? {
      ...listItem,
      authScope: { auth_user: ["ou001"] },
      permanentCodeConfigured: true,
      corpTokenCached: true,
      corpTokenExpiresAt: new Date("2026-07-16T04:00:00.000Z"),
      cancelAuthTime: null,
      adminCount: 1,
      activeAdminCount: 1,
      admins: [{
        adminId: "8",
        memberId: "30",
        name: "张三",
        openUserid: "account:10",
        role: "owner" as const,
        status: "active",
        authSource: "claim_token",
        createdAt: new Date("2026-07-16T01:00:00.000Z"),
        updatedAt: new Date("2026-07-16T01:00:00.000Z")
      }],
      lastCallback: {
        eventType: "create_auth",
        changeType: null,
        status: "done",
        receivedAt: new Date("2026-07-16T01:00:00.000Z"),
        processedAt: new Date("2026-07-16T01:00:01.000Z"),
        retryCount: 0,
        lastError: null
      }
    } : null),
    getLocalWritable: jest.fn(async (tenantId: string) => tenantId === "2"
      ? { tenantId: "2", name: "本地企业", status: "active" as const, activeOwnerCount: 0 }
      : null),
    createLocalTenant: jest.fn(async (input: { name: string; memberLimit: number | null }) => ({ tenantId: "10", name: input.name })),
    renameLocalTenant: jest.fn(async () => true),
    setLocalTenantStatus: jest.fn(async () => true),
    softDeleteLocalTenant: jest.fn(async () => true)
  };
}

function createContactSync() {
  return {
    syncTenantMembers: jest.fn(async () => ({
      tenantId: "2",
      syncedCount: 5,
      skippedCount: 1,
      disabledCount: 0,
      detailSyncedCount: 3,
      detailMissingCount: 2,
      source: "contact_api" as const
    }))
  };
}

function createService(repository = createRepository(), contactSync = createContactSync()) {
  const ownerBootstrap = {
    bootstrapOwner: jest.fn(async () => ({
      mode: "claim_token_created" as const,
      tenant_id: "2",
      claim_token: "admclaim_abcdefghijklmnopqrstuvwxyz123456",
      expires_at: new Date(Date.now() + 900_000).toISOString()
    }))
  };
  const claimQr = {
    generateScene: jest.fn(async () => "data:image/png;base64,Y2xhaW0=")
  };
  return {
    service: new PlatformTenantService(repository as never, contactSync as never, ownerBootstrap as never, claimQr as never),
    repository,
    contactSync,
    ownerBootstrap,
    claimQr
  };
}

describe("PlatformTenantService", () => {
  it("lists enterprise authorization details for platform administrators", async () => {
    const { service, repository } = createService();
    await expect(service.list(platformSession, { search: "测试", status: "active" })).resolves.toMatchObject({
      total: 1,
      summary: { local_count: 0, active_count: 1, cancelled_count: 0, unhealthy_count: 0 },
      items: [{
        tenant_id: "2",
        tenant_name: "测试企业",
        creation_source: "wecom",
        member_count: 3,
        authorization_healthy: true
      }]
    });
    expect(repository.list).toHaveBeenCalledWith({ search: "测试", status: "active", limit: 20, offset: 0 });
  });

  it("returns a sanitized detail without encrypted credentials", async () => {
    const { service } = createService();
    const result = await service.get(platformSession, "2");
    expect(result).toMatchObject({
      tenant_id: "2",
      authorization_healthy: true,
      permanent_code_configured: true,
      last_callback: { event_type: "create_auth", status: "done" },
      admins: [{ admin_id: "8", name: "张三", role: "owner", status: "active" }]
    });
    expect(result).not.toHaveProperty("permanent_code_encrypted");
    expect(result).not.toHaveProperty("corp_access_token_encrypted");
  });

  it("rejects tenant administrators", async () => {
    const { service } = createService();
    await expect(service.list(tenantSession, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found for an unknown enterprise", async () => {
    const { service } = createService();
    await expect(service.get(platformSession, "999")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("triggers a contact sync for an authorized enterprise", async () => {
    const { service, contactSync } = createService();
    await expect(service.syncTenantMembers(platformSession, "2")).resolves.toMatchObject({
      tenant_id: "2",
      synced_count: 5
    });
    expect(contactSync.syncTenantMembers).toHaveBeenCalledWith({ tenantId: "2", tenantName: "测试企业" });
  });

  it("rejects resync from tenant administrators", async () => {
    const { service, contactSync } = createService();
    await expect(service.syncTenantMembers(tenantSession, "2")).rejects.toBeInstanceOf(ForbiddenException);
    expect(contactSync.syncTenantMembers).not.toHaveBeenCalled();
  });

  it("rejects WeCom sync for a local enterprise", async () => {
    const repository = createRepository();
    repository.getById.mockResolvedValueOnce({
      ...await repository.getById("2"),
      creationSource: "local",
      openCorpid: null,
      authStatus: "unconnected"
    } as never);
    const { service, contactSync } = createService(repository);
    await expect(service.syncTenantMembers(platformSession, "2")).rejects.toBeInstanceOf(BadRequestException);
    expect(contactSync.syncTenantMembers).not.toHaveBeenCalled();
  });

  it("creates a local enterprise shell and returns a claim QR code", async () => {
    const { service, repository, ownerBootstrap, claimQr } = createService();
    const result = await service.createLocalEnterprise(platformSession, { name: "新本地企业", memberLimit: null });
    expect(repository.createLocalTenant).toHaveBeenCalledWith({ name: "新本地企业", memberLimit: null });
    expect(ownerBootstrap.bootstrapOwner).toHaveBeenCalledWith({ tenant_id: "10" });
    expect(claimQr.generateScene).toHaveBeenCalledWith("abcdefghijklmnopqrstuvwxyz123456", "pages/enterprise-claim/index");
    expect(((claimQr.generateScene.mock.calls[0] as unknown[] | undefined)?.[0] as string)).toHaveLength(32);
    expect(result).toMatchObject({
      tenant_id: "10",
      tenant_name: "新本地企业",
      member_limit: null,
      claim_token: "admclaim_abcdefghijklmnopqrstuvwxyz123456",
      claim_qr_code_data_url: "data:image/png;base64,Y2xhaW0="
    });
    expect(result.claim_path).toContain("admclaim_abcdefghijklmnopqrstuvwxyz123456");
  });

  it("creates a fresh local enterprise claim QR code from an existing tenant", async () => {
    const { service, repository, ownerBootstrap, claimQr } = createService();
    const result = await service.createLocalEnterpriseClaimToken(platformSession, "2");
    expect(repository.getLocalWritable).toHaveBeenCalledWith("2");
    expect(ownerBootstrap.bootstrapOwner).toHaveBeenCalledWith({ tenant_id: "2" });
    expect(claimQr.generateScene).toHaveBeenCalledWith("abcdefghijklmnopqrstuvwxyz123456", "pages/enterprise-claim/index");
    expect(((claimQr.generateScene.mock.calls[0] as unknown[] | undefined)?.[0] as string)).toHaveLength(32);
    expect(result).toMatchObject({
      tenant_id: "2",
      tenant_name: "本地企业",
      claim_token: "admclaim_abcdefghijklmnopqrstuvwxyz123456",
      claim_qr_code_data_url: "data:image/png;base64,Y2xhaW0="
    });
  });

  it("returns the Mini Program QR generation error for an existing local claim token", async () => {
    const { service, claimQr } = createService();
    claimQr.generateScene.mockRejectedValueOnce(new Error("WeChat QR failed: 40001 invalid credential"));
    await expect(service.createLocalEnterpriseClaimToken(platformSession, "2")).resolves.toMatchObject({
      tenant_id: "2",
      claim_qr_code_data_url: null,
      claim_qr_error: "WeChat QR failed: 40001 invalid credential"
    });
  });

  it("rejects fresh claim QR creation when the local enterprise already has an owner", async () => {
    const repository = createRepository();
    repository.getLocalWritable.mockResolvedValueOnce({ tenantId: "2", name: "本地企业", status: "active", activeOwnerCount: 1 });
    const { service, ownerBootstrap, claimQr } = createService(repository);
    await expect(service.createLocalEnterpriseClaimToken(platformSession, "2")).rejects.toBeInstanceOf(BadRequestException);
    expect(ownerBootstrap.bootstrapOwner).not.toHaveBeenCalled();
    expect(claimQr.generateScene).not.toHaveBeenCalled();
  });

  it("rejects a create with too short a name", async () => {
    const { service, repository } = createService();
    await expect(service.createLocalEnterprise(platformSession, { name: "x", memberLimit: null })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.createLocalTenant).not.toHaveBeenCalled();
  });

  it("renames a local enterprise", async () => {
    const { service, repository } = createService();
    await expect(service.renameLocalEnterprise(platformSession, "2", "改名后的企业")).resolves.toMatchObject({
      tenant_id: "2",
      tenant_name: "改名后的企业"
    });
    expect(repository.renameLocalTenant).toHaveBeenCalledWith("2", "改名后的企业");
  });

  it("rejects rename for a non-local or deleted enterprise", async () => {
    const { service, repository } = createService();
    await expect(service.renameLocalEnterprise(platformSession, "999", "任意名称")).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.renameLocalTenant).not.toHaveBeenCalled();
  });

  it("disables and enables a local enterprise", async () => {
    const { service, repository } = createService();
    await expect(service.setLocalEnterpriseStatus(platformSession, "2", "disabled")).resolves.toMatchObject({ tenant_id: "2", status: "disabled" });
    await expect(service.setLocalEnterpriseStatus(platformSession, "2", "active")).resolves.toMatchObject({ tenant_id: "2", status: "active" });
    expect(repository.setLocalTenantStatus).toHaveBeenNthCalledWith(1, "2", "disabled");
    expect(repository.setLocalTenantStatus).toHaveBeenNthCalledWith(2, "2", "active");
  });

  it("soft deletes a local enterprise", async () => {
    const { service, repository } = createService();
    await expect(service.deleteLocalEnterprise(platformSession, "2")).resolves.toMatchObject({ tenant_id: "2", deleted: true });
    expect(repository.softDeleteLocalTenant).toHaveBeenCalledWith("2");
  });

  it("rejects local enterprise mutations from non-owner platform sessions", async () => {
    const { service } = createService();
    const editorSession = { ...platformSession, role: "support" } as AdminSession;
    await expect(service.createLocalEnterprise(editorSession, { name: "任意名称", memberLimit: null })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

