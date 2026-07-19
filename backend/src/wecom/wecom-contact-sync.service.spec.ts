import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import {
  WecomApiClientService,
  type WecomContactUserIdentity
} from "./wecom-api-client.service.js";
import {
  WecomContactSyncRepository,
  type SyncWecomContactMembersInput,
  type SyncWecomContactMembersResult
} from "./wecom-contact-sync.repository.js";
import { WecomContactSyncService } from "./wecom-contact-sync.service.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import type { WecomCorpAccessTokenResult } from "./wecom-corp-token.service.js";
import { WecomTenantAuthRepository, type TenantAuthorizationSnapshot } from "./wecom-tenant-auth.repository.js";
import { WecomTenantSettingsRepository } from "./wecom-tenant-settings.repository.js";

describe("WecomContactSyncService", () => {
  it("fetches contact user ids, enriches details and upserts active members", async () => {
    const { service, api, repository } = createService();
    api.departmentUsers = [
      { userid: "user-001", openUserid: "ou-001", name: "user-001", departmentIds: ["1"] },
      { userid: "user-002", openUserid: null, name: null, departmentIds: [] },
      { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1"] }
    ];
    api.details.set("user-001", {
      userid: "user-001",
      openUserid: "ou-001",
      name: "Ada",
      departmentIds: ["1"],
      title: "VP Sales",
      mobile: "13800138000",
      email: "ada@example.com"
    });
    api.details.set("user-002", {
      userid: "user-002",
      openUserid: null,
      name: "Bob",
      departmentIds: [],
      title: null,
      mobile: null,
      email: null
    });

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result).toEqual({
      tenantId: "tenant-001",
      syncedCount: 2,
      skippedCount: 0,
      disabledCount: 0,
      detailSyncedCount: 2,
      detailMissingCount: 0
    });
    expect(api.departmentRequests).toEqual([{ accessToken: "corp-token", departmentId: 1, fetchChild: true }]);
    expect(repository.lastInput?.users).toEqual([
      {
        userid: "user-001",
        openUserid: "ou-001",
        name: "Ada",
        departmentIds: ["1"],
        title: "VP Sales",
        mobile: "13800138000",
        email: "ada@example.com",
        status: "active"
      },
      {
        userid: "user-002",
        openUserid: null,
        name: "Bob",
        departmentIds: [],
        title: null,
        mobile: null,
        email: null,
        status: "active"
      }
    ]);
  });

  it("fails clearly when tenant authorization is missing", async () => {
    const { service, tenants } = createService();
    tenants.authorization = null;

    await expect(service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" })).rejects.toThrow(
      ServiceUnavailableException
    );
  });

  it("does not count account aliases as synced real member details", async () => {
    const { service, api } = createService();
    api.departmentUsers = [{ userid: "user-001", openUserid: "ou-001", name: "user-001", departmentIds: [] }];
    api.details.set("user-001", {
      userid: "user-001",
      openUserid: "ou-001",
      name: "user-001",
      departmentIds: [],
      title: null,
      mobile: null,
      email: null
    });

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result.detailSyncedCount).toBe(0);
    expect(result.detailMissingCount).toBe(1);
  });

  it("applies tenant sync settings for card creation and stale member disabling", async () => {
    const { service, api, repository, settings } = createService();
    settings.settings = {
      tenant_id: "tenant-001",
      auto_sync_on_auth: true,
      auto_create_cards: false,
      auto_disable_left_members: false,
      allow_employee_privacy_edit: true,
      allow_employee_share_edit: true,
      allow_employee_wecom_qrcode_upload: true,
      qrcode_source: "enterprise_first",
      updated_at: null
    };
    api.departmentUsers = [{ userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: [] }];

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result.disabledCount).toBe(0);
    expect(repository.lastInput?.createCards).toBe(false);
    expect(repository.lastStaleInput).toBeNull();
  });

  it("keeps basic contact sync when detail API permission is missing", async () => {
    const { service, api, repository } = createService();
    api.departmentUsers = [
      { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1"] }
    ];
    api.detailErrors.set("user-001", new ForbiddenException("no user/get privilege"));

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result).toMatchObject({
      syncedCount: 1,
      detailSyncedCount: 1,
      detailMissingCount: 0
    });
    expect(repository.lastInput?.users).toEqual([
      {
        userid: "user-001",
        openUserid: "ou-001",
        name: "Ada",
        departmentIds: ["1"],
        title: null,
        mobile: null,
        email: null,
        status: "active"
      }
    ]);
  });

  it("does not use user list_id when basic member listing permission is missing", async () => {
    const { service, api } = createService();
    api.departmentError = new ForbiddenException("no user/simplelist privilege");

    await expect(service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" })).rejects.toThrow(
      "no user/simplelist privilege"
    );

    expect(api.departmentRequests).toEqual([{ accessToken: "corp-token", departmentId: 1, fetchChild: true }]);
  });
});

class FakeTenantAuthRepository {
  authorization: TenantAuthorizationSnapshot | null = {
    tenantId: "tenant-001",
    openCorpid: "corp-001",
    corpName: "Pilot Corp",
    permanentCode: "perm-001",
    agentId: "100001",
    authStatus: "active"
  };

  async getByTenantId(): Promise<TenantAuthorizationSnapshot | null> {
    return this.authorization;
  }
}

class FakeCorpTokenService {
  async getCorpAccessToken(): Promise<WecomCorpAccessTokenResult> {
    return {
      openCorpid: "corp-001",
      accessToken: "corp-token",
      expiresAt: new Date("2026-07-06T12:00:00.000Z"),
      fromCache: true
    };
  }
}

class FakeWecomApiClient {
  departmentRequests: Array<{ accessToken: string; departmentId?: string | number; fetchChild?: boolean }> = [];
  departmentUsers: WecomContactUserIdentity[] = [];
  departmentError: Error | null = null;
  details = new Map<string, WecomContactUserIdentity>();
  detailErrors = new Map<string, Error>();

  async fetchDepartmentUsers(request: { accessToken: string; departmentId?: string | number; fetchChild?: boolean }): Promise<WecomContactUserIdentity[]> {
    this.departmentRequests.push(request);
    if (this.departmentError) {
      throw this.departmentError;
    }
    return this.departmentUsers;
  }

  async fetchContactUserDetail(request: { userid: string }): Promise<WecomContactUserIdentity> {
    const error = this.detailErrors.get(request.userid);
    if (error) {
      throw error;
    }
    return this.details.get(request.userid) ?? {
      userid: request.userid,
      openUserid: null,
      name: null,
      departmentIds: [],
      title: null,
      mobile: null,
      email: null
    };
  }
}

class FakeContactSyncRepository {
  lastInput: SyncWecomContactMembersInput | null = null;
  lastStaleInput: { tenantId: string; activeOpenUserids: string[]; activeUserids: string[] } | null = null;

  async upsertMembers(input: SyncWecomContactMembersInput): Promise<SyncWecomContactMembersResult> {
    this.lastInput = input;
    return {
      syncedCount: input.users.length,
      skippedCount: 0
    };
  }

  async disableStaleMembers(input: { tenantId: string; activeOpenUserids: string[]; activeUserids: string[] }): Promise<number> {
    this.lastStaleInput = input;
    return 0;
  }
}

class FakeTenantSettingsRepository {
  settings = {
    tenant_id: "tenant-001",
    auto_sync_on_auth: true,
    auto_create_cards: true,
    auto_disable_left_members: true,
    allow_employee_privacy_edit: true,
    allow_employee_share_edit: true,
    allow_employee_wecom_qrcode_upload: true,
    qrcode_source: "enterprise_first" as const,
    updated_at: null
  };

  async get() {
    return this.settings;
  }
}

function createService() {
  const tenants = new FakeTenantAuthRepository();
  const corpTokens = new FakeCorpTokenService();
  const api = new FakeWecomApiClient();
  const repository = new FakeContactSyncRepository();
  const settings = new FakeTenantSettingsRepository();
  const service = new WecomContactSyncService(
    tenants as unknown as WecomTenantAuthRepository,
    corpTokens as unknown as WecomCorpTokenService,
    api as unknown as WecomApiClientService,
    repository as unknown as WecomContactSyncRepository,
    settings as unknown as WecomTenantSettingsRepository
  );
  return { service, tenants, api, repository, settings };
}
