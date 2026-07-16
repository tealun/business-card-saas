import { ServiceUnavailableException } from "@nestjs/common";
import {
  WecomApiClientService,
  type FetchContactUserIdsRequest,
  type FetchContactUserIdsResponse
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
  it("fetches contact users across pages and upserts active members", async () => {
    const { service, api, repository } = createService();
    api.pages = [
      {
        users: [{ userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1"] }],
        nextCursor: "cursor-2"
      },
      {
        users: [{ userid: "user-002", openUserid: null, name: null, departmentIds: [] }],
        nextCursor: null
      }
    ];

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result).toEqual({ tenantId: "tenant-001", syncedCount: 2, skippedCount: 0, disabledCount: 0 });
    expect(api.requests).toEqual([
      { accessToken: "corp-token", cursor: "", limit: 1000 },
      { accessToken: "corp-token", cursor: "cursor-2", limit: 1000 }
    ]);
    expect(repository.lastInput?.users).toEqual([
      { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1"], status: "active" },
      { userid: "user-002", openUserid: null, name: null, departmentIds: [], status: "active" }
    ]);
  });

  it("fails clearly when tenant authorization is missing", async () => {
    const { service, tenants } = createService();
    tenants.authorization = null;

    await expect(service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" })).rejects.toThrow(
      ServiceUnavailableException
    );
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
    api.pages = [{ users: [{ userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: [] }], nextCursor: null }];

    const result = await service.syncTenantMembers({ tenantId: "tenant-001", tenantName: "Pilot Corp" });

    expect(result.disabledCount).toBe(0);
    expect(repository.lastInput?.createCards).toBe(false);
    expect(repository.lastStaleInput).toBeNull();
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
  requests: FetchContactUserIdsRequest[] = [];
  pages: FetchContactUserIdsResponse[] = [{ users: [], nextCursor: null }];

  async fetchContactUserIds(request: FetchContactUserIdsRequest): Promise<FetchContactUserIdsResponse> {
    this.requests.push(request);
    return this.pages.shift() ?? { users: [], nextCursor: null };
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
