import { ForbiddenException, NotFoundException } from "@nestjs/common";
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
  openCorpid: "wwcorp001",
  authStatus: "active",
  agentId: "100001",
  authorizedAt: new Date("2026-07-16T01:00:00.000Z"),
  updatedAt: new Date("2026-07-16T02:00:00.000Z"),
  memberCount: 3,
  activeMemberCount: 2,
  cardCount: 3,
  activeCardCount: 2
};

function createRepository() {
  return {
    list: jest.fn(async () => ({ items: [listItem], total: 1 })),
    getById: jest.fn(async (tenantId: string) => tenantId === "2" ? {
      ...listItem,
      authScope: { auth_user: ["ou001"] },
      permanentCodeConfigured: true,
      corpTokenCached: true,
      corpTokenExpiresAt: new Date("2026-07-16T04:00:00.000Z"),
      cancelAuthTime: null,
      adminCount: 1,
      activeAdminCount: 1,
      lastCallback: {
        eventType: "create_auth",
        changeType: null,
        status: "done",
        receivedAt: new Date("2026-07-16T01:00:00.000Z"),
        processedAt: new Date("2026-07-16T01:00:01.000Z"),
        retryCount: 0,
        lastError: null
      }
    } : null)
  };
}

describe("PlatformTenantService", () => {
  it("lists enterprise authorization details for platform administrators", async () => {
    const repository = createRepository();
    const service = new PlatformTenantService(repository as never);
    await expect(service.list(platformSession, { search: "测试", status: "active" })).resolves.toMatchObject({
      total: 1,
      items: [{ tenant_id: "2", tenant_name: "测试企业", member_count: 3 }]
    });
    expect(repository.list).toHaveBeenCalledWith({ search: "测试", status: "active", limit: 20, offset: 0 });
  });

  it("returns a sanitized detail without encrypted credentials", async () => {
    const service = new PlatformTenantService(createRepository() as never);
    const result = await service.get(platformSession, "2");
    expect(result).toMatchObject({
      tenant_id: "2",
      authorization_healthy: true,
      permanent_code_configured: true,
      last_callback: { event_type: "create_auth", status: "done" }
    });
    expect(result).not.toHaveProperty("permanent_code_encrypted");
    expect(result).not.toHaveProperty("corp_access_token_encrypted");
  });

  it("rejects tenant administrators", async () => {
    const service = new PlatformTenantService(createRepository() as never);
    await expect(service.list(tenantSession, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("returns not found for an unknown enterprise", async () => {
    const service = new PlatformTenantService(createRepository() as never);
    await expect(service.get(platformSession, "999")).rejects.toBeInstanceOf(NotFoundException);
  });
});

