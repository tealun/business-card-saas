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

    expect(result).toEqual({ tenantId: "tenant-001", syncedCount: 2, skippedCount: 0 });
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

  async upsertMembers(input: SyncWecomContactMembersInput): Promise<SyncWecomContactMembersResult> {
    this.lastInput = input;
    return {
      syncedCount: input.users.length,
      skippedCount: 0
    };
  }
}

function createService() {
  const tenants = new FakeTenantAuthRepository();
  const corpTokens = new FakeCorpTokenService();
  const api = new FakeWecomApiClient();
  const repository = new FakeContactSyncRepository();
  const service = new WecomContactSyncService(
    tenants as unknown as WecomTenantAuthRepository,
    corpTokens as unknown as WecomCorpTokenService,
    api as unknown as WecomApiClientService,
    repository as unknown as WecomContactSyncRepository
  );
  return { service, tenants, api, repository };
}
