import { DatabaseService } from "../database/database.service.js";
import { WecomApiClientService, type FetchCorpTokenRequest, type FetchCorpTokenResponse } from "./wecom-api-client.service.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteTokenService, type WecomSuiteAccessTokenResult } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

describe("WecomCorpTokenService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns a fresh cached corp access token without calling WeCom", async () => {
    const { service, api, tenants } = createService();
    await saveTenant(tenants);
    await tenants.saveCorpAccessToken("corp-001", "cached-corp-token", new Date("2026-07-06T10:20:00.000Z"));

    const result = await service.getCorpAccessToken("corp-001", new Date("2026-07-06T10:00:00.000Z"));

    expect(result.accessToken).toBe("cached-corp-token");
    expect(result.fromCache).toBe(true);
    expect(api.calls).toBe(0);
  });

  it("uses singleflight when concurrent requests refresh the corp token", async () => {
    const { service, api, tenants } = createService();
    await saveTenant(tenants);
    api.nextResponse = { accessToken: "fresh-corp-token", expiresIn: 7200 };

    const [first, second] = await Promise.all([
      service.getCorpAccessToken("corp-001", new Date("2026-07-06T10:00:00.000Z")),
      service.getCorpAccessToken("corp-001", new Date("2026-07-06T10:00:00.000Z"))
    ]);

    expect(first.accessToken).toBe("fresh-corp-token");
    expect(second.accessToken).toBe("fresh-corp-token");
    expect(first.fromCache).toBe(false);
    expect(api.calls).toBe(1);
    expect(api.lastRequest).toEqual({
      suiteAccessToken: "suite-token",
      openCorpid: "corp-001",
      permanentCode: "perm-001"
    });
  });

  it("fails clearly when the tenant has not been authorized", async () => {
    const { service } = createService();

    await expect(service.getCorpAccessToken("corp-missing")).rejects.toThrow("WeCom tenant authorization is not available");
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
  calls = 0;
  lastRequest: FetchCorpTokenRequest | null = null;
  nextResponse: FetchCorpTokenResponse = { accessToken: "corp-token", expiresIn: 7200 };

  async fetchCorpAccessToken(request: FetchCorpTokenRequest): Promise<FetchCorpTokenResponse> {
    this.calls += 1;
    this.lastRequest = request;
    await Promise.resolve();
    return this.nextResponse;
  }
}

function createService() {
  const api = new FakeWecomApiClient();
  const tenants = new WecomTenantAuthRepository(new DatabaseService(), new WecomStateCipherService());
  const service = new WecomCorpTokenService(
    new FakeSuiteTokenService() as unknown as WecomSuiteTokenService,
    api as unknown as WecomApiClientService,
    tenants
  );
  return { service, api, tenants };
}

async function saveTenant(tenants: WecomTenantAuthRepository) {
  await tenants.saveAuthorization({
    openCorpid: "corp-001",
    corpName: "Pilot Corp",
    permanentCode: "perm-001",
    agentId: "100001",
    authInfo: null,
    authorizedAt: new Date("2026-07-06T09:00:00.000Z")
  });
}
