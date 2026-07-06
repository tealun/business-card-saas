import { DatabaseService } from "../database/database.service.js";
import { WecomApiClientService, type FetchPermanentCodeRequest, type FetchPermanentCodeResponse } from "./wecom-api-client.service.js";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteTokenService, type WecomSuiteAccessTokenResult } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

describe("WecomAuthorizationService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("exchanges auth_code and upserts an active tenant authorization", async () => {
    const { service, api, tenants } = createService();

    const saved = await service.handleAuthCode(" auth-code-001 ", new Date("2026-07-06T10:00:00.000Z"));

    expect(saved.openCorpid).toBe("corp-001");
    expect(saved.corpName).toBe("Pilot Corp");
    expect(saved.permanentCode).toBe("perm-001");
    expect(saved.agentId).toBe("100001");
    expect(api.lastRequest).toEqual({ suiteAccessToken: "suite-token", authCode: "auth-code-001" });

    const stored = await tenants.getByOpenCorpid("corp-001");
    expect(stored?.permanentCode).toBe("perm-001");
    expect(stored?.authStatus).toBe("active");
  });

  it("updates an existing tenant authorization for the same corp", async () => {
    const { service, api, tenants } = createService();
    await service.handleAuthCode("auth-code-001");
    api.nextResponse = {
      openCorpid: "corp-001",
      corpName: "Pilot Corp Renamed",
      permanentCode: "perm-002",
      agentId: "100002",
      authInfo: { agent: [{ agentid: 100002 }] }
    };

    const updated = await service.handleAuthCode("auth-code-002");

    const stored = await tenants.getByOpenCorpid("corp-001");
    expect(updated.tenantId).toBe(stored?.tenantId);
    expect(stored?.corpName).toBe("Pilot Corp Renamed");
    expect(stored?.permanentCode).toBe("perm-002");
    expect(stored?.agentId).toBe("100002");
  });
});

class FakeSuiteTokenService {
  async getSuiteAccessToken(): Promise<WecomSuiteAccessTokenResult> {
    return {
      suiteId: "suite-id",
      accessToken: "suite-token",
      expiresAt: new Date("2026-07-06T12:00:00.000Z"),
      fromCache: true
    };
  }
}

class FakeWecomApiClient {
  lastRequest: FetchPermanentCodeRequest | null = null;
  nextResponse: FetchPermanentCodeResponse = {
    openCorpid: "corp-001",
    corpName: "Pilot Corp",
    permanentCode: "perm-001",
    agentId: "100001",
    authInfo: { agent: [{ agentid: 100001 }] }
  };

  async fetchPermanentCode(request: FetchPermanentCodeRequest): Promise<FetchPermanentCodeResponse> {
    this.lastRequest = request;
    return this.nextResponse;
  }
}

function createService() {
  const api = new FakeWecomApiClient();
  const tenants = new WecomTenantAuthRepository(new DatabaseService(), new WecomStateCipherService());
  const service = new WecomAuthorizationService(
    new FakeSuiteTokenService() as unknown as WecomSuiteTokenService,
    api as unknown as WecomApiClientService,
    tenants
  );
  return { service, api, tenants };
}
