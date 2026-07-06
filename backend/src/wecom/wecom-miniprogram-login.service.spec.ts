import { DatabaseService } from "../database/database.service.js";
import { WecomApiClientService, type FetchMiniProgramSessionRequest, type FetchMiniProgramSessionResponse } from "./wecom-api-client.service.js";
import { WecomEmployeeProvisioningRepository } from "./wecom-employee-provisioning.repository.js";
import { WecomMiniProgramLoginService } from "./wecom-miniprogram-login.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteTokenService, type WecomSuiteAccessTokenResult } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

describe("WecomMiniProgramLoginService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("resolves js_code to an authorized tenant and open_userid", async () => {
    const { service, api, tenants } = createService();
    await saveTenant(tenants);

    const identity = await service.resolveJsCode(" js-code-001 ");

    expect(identity).toEqual({
      accountId: "1001",
      tenantId: "1",
      tenantName: "Pilot Corp",
      memberIdentityId: "1001",
      displayName: "ou-001",
      openCorpid: "corp-001",
      openUserid: "ou-001",
      publicId: expect.stringMatching(/^pub_[A-Za-z0-9_-]{24}$/),
      sessionKey: "session-key"
    });
    expect(api.lastRequest).toEqual({ suiteAccessToken: "suite-token", jsCode: "js-code-001" });
  });

  it("rejects login codes from unauthorized tenants", async () => {
    const { service, api } = createService();
    api.nextResponse = {
      openCorpid: "corp-unknown",
      openUserid: "ou-001",
      sessionKey: null
    };

    await expect(service.resolveJsCode("js-code-001")).rejects.toThrow("WeCom tenant is not authorized");
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
  lastRequest: FetchMiniProgramSessionRequest | null = null;
  nextResponse: FetchMiniProgramSessionResponse = {
    openCorpid: "corp-001",
    openUserid: "ou-001",
    sessionKey: "session-key"
  };

  async fetchMiniProgramSession(request: FetchMiniProgramSessionRequest): Promise<FetchMiniProgramSessionResponse> {
    this.lastRequest = request;
    return this.nextResponse;
  }
}

function createService() {
  const api = new FakeWecomApiClient();
  const tenants = new WecomTenantAuthRepository(new DatabaseService(), new WecomStateCipherService());
  const employees = new WecomEmployeeProvisioningRepository(new DatabaseService());
  const service = new WecomMiniProgramLoginService(
    new FakeSuiteTokenService() as unknown as WecomSuiteTokenService,
    api as unknown as WecomApiClientService,
    tenants,
    employees
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
