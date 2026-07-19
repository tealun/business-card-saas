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
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import type { WecomCorpAccessTokenResult } from "./wecom-corp-token.service.js";
import { WecomTenantAuthRepository, type TenantAuthorizationSnapshot } from "./wecom-tenant-auth.repository.js";
import { WecomTenantSettingsRepository } from "./wecom-tenant-settings.repository.js";

describe("WecomContactSyncService", () => {
  it("enumerates visible departments, dedupes members and upserts active members", async () => {
    const { service, api, repository } = createService();
    api.departmentIds = ["1", "2"];
    api.departmentUsersById.set("1", [
      { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1"] },
      { userid: "user-002", openUserid: null, name: null, departmentIds: [] }
    ]);
    api.departmentUsersById.set("2", [
      { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1", "2"] }
    ]);

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result).toEqual({
      tenantId: "tenant-001",
      syncedCount: 2,
      skippedCount: 0,
      disabledCount: 0,
      detailSyncedCount: 1,
      detailMissingCount: 1
    });
    expect(api.departmentIdRequests).toEqual([{ accessToken: "corp-token" }]);
    expect(api.departmentRequests).toEqual([
      { accessToken: "corp-token", departmentId: "1" },
      { accessToken: "corp-token", departmentId: "2" }
    ]);
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
      },
      {
        userid: "user-002",
        openUserid: null,
        name: null,
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
    api.departmentIds = ["1"];
    api.departmentUsersById.set("1", [
      { userid: "user-001", openUserid: "ou-001", name: "user-001", departmentIds: [] }
    ]);

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
    api.departmentIds = ["1"];
    api.departmentUsersById.set("1", [
      { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: [] }
    ]);

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result.disabledCount).toBe(0);
    expect(repository.lastInput?.createCards).toBe(false);
    expect(repository.lastStaleInput).toBeNull();
  });

  it("propagates department listing permission errors when the authorization scope has no members", async () => {
    const { service, api } = createService();
    api.departmentIdsError = new ForbiddenException("no department/simplelist privilege");
    api.authInfo = { agent: [{ privilege: { allow_party: [1], allow_user: [] } }] };

    await expect(service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" })).rejects.toThrow(
      "no department/simplelist privilege"
    );

    expect(api.departmentRequests).toEqual([]);
  });

  it("falls back to authorization scope members when contact APIs are forbidden", async () => {
    const { service, api, repository } = createService();
    api.departmentIdsError = new ForbiddenException("no department/simplelist privilege");
    api.authInfo = {
      agent: [
        { privilege: { allow_user: ["ou-001", "ou-002", "ou-001"] } },
        { privilege: { allow_user: ["ou-003"] } }
      ]
    };

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result).toMatchObject({
      syncedCount: 3,
      detailSyncedCount: 0,
      detailMissingCount: 3
    });
    expect(api.authInfoRequests).toEqual([
      { suiteAccessToken: "suite-token", openCorpid: "corp-001", permanentCode: "perm-001" }
    ]);
    expect(repository.lastInput?.users).toEqual([
      { userid: null, openUserid: "ou-001", name: null, departmentIds: [], title: null, mobile: null, email: null, status: "active" },
      { userid: null, openUserid: "ou-002", name: null, departmentIds: [], title: null, mobile: null, email: null, status: "active" },
      { userid: null, openUserid: "ou-003", name: null, departmentIds: [], title: null, mobile: null, email: null, status: "active" }
    ]);
  });

  it("propagates member listing permission errors", async () => {
    const { service, api } = createService();
    api.departmentIds = ["1"];
    api.departmentError = new ForbiddenException("no user/simplelist privilege");

    await expect(service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" })).rejects.toThrow(
      "no user/simplelist privilege"
    );

    expect(api.departmentRequests).toEqual([{ accessToken: "corp-token", departmentId: "1" }]);
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
  departmentIdRequests: Array<{ accessToken: string }> = [];
  departmentIds: string[] = ["1"];
  departmentIdsError: Error | null = null;
  departmentRequests: Array<{ accessToken: string; departmentId: string | number }> = [];
  departmentUsersById = new Map<string, WecomContactUserIdentity[]>();
  departmentError: Error | null = null;
  authInfo: unknown = null;
  authInfoRequests: Array<{ suiteAccessToken: string; openCorpid: string; permanentCode: string }> = [];

  async fetchVisibleDepartmentIds(request: { accessToken: string }): Promise<string[]> {
    this.departmentIdRequests.push(request);
    if (this.departmentIdsError) {
      throw this.departmentIdsError;
    }
    return this.departmentIds;
  }

  async fetchDepartmentUsers(request: { accessToken: string; departmentId: string | number }): Promise<WecomContactUserIdentity[]> {
    this.departmentRequests.push(request);
    if (this.departmentError) {
      throw this.departmentError;
    }
    return this.departmentUsersById.get(String(request.departmentId)) ?? [];
  }

  async fetchAuthorizationInfo(request: { suiteAccessToken: string; openCorpid: string; permanentCode: string }) {
    this.authInfoRequests.push(request);
    return {
      openCorpid: request.openCorpid,
      corpName: "Pilot Corp",
      agentId: "100001",
      authInfo: this.authInfo
    };
  }
}

class FakeSuiteTokenService {
  async getSuiteAccessToken() {
    return { accessToken: "suite-token", expiresAt: new Date("2026-07-06T12:00:00.000Z") };
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
  const suiteTokens = new FakeSuiteTokenService();
  const service = new WecomContactSyncService(
    tenants as unknown as WecomTenantAuthRepository,
    corpTokens as unknown as WecomCorpTokenService,
    api as unknown as WecomApiClientService,
    repository as unknown as WecomContactSyncRepository,
    settings as unknown as WecomTenantSettingsRepository,
    suiteTokens as unknown as WecomSuiteTokenService
  );
  return { service, tenants, api, repository, settings };
}
