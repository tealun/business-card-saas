import { DatabaseService } from "../database/database.service.js";
import { WecomApiClientService, type FetchSuiteTokenRequest, type FetchSuiteTokenResponse } from "./wecom-api-client.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";

describe("WecomSuiteTokenService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("returns a fresh cached suite_access_token without calling WeCom", async () => {
    const { service, api, state, config } = createService();
    await state.saveSuiteAccessToken(config.suite.suiteId, "cached-token", new Date("2026-07-06T10:20:00.000Z"));

    const result = await service.getSuiteAccessToken(new Date("2026-07-06T10:00:00.000Z"));

    expect(result.accessToken).toBe("cached-token");
    expect(result.fromCache).toBe(true);
    expect(api.calls).toBe(0);
  });

  it("uses singleflight when concurrent requests refresh the token", async () => {
    const { service, api, state, config } = createService();
    await state.saveSuiteTicket(config.suite.suiteId, "ticket-001", new Date("2026-07-06T10:00:00.000Z"));
    api.nextResponse = { suiteAccessToken: "fresh-token", expiresIn: 7200 };

    const [first, second, third] = await Promise.all([
      service.getSuiteAccessToken(new Date("2026-07-06T10:00:00.000Z")),
      service.getSuiteAccessToken(new Date("2026-07-06T10:00:00.000Z")),
      service.getSuiteAccessToken(new Date("2026-07-06T10:00:00.000Z"))
    ]);

    expect(first.accessToken).toBe("fresh-token");
    expect(second.accessToken).toBe("fresh-token");
    expect(third.accessToken).toBe("fresh-token");
    expect(first.fromCache).toBe(false);
    expect(api.calls).toBe(1);
    expect(api.lastRequest?.suiteTicket).toBe("ticket-001");
  });

  it("refreshes login authorization suite_access_token with login SuiteID and Secret", async () => {
    const { service, api, state, config } = createService();
    await state.saveSuiteTicket(config.suite.loginSuiteId, "login-ticket-001", new Date("2026-07-06T10:00:00.000Z"));
    api.nextResponse = { suiteAccessToken: "login-token", expiresIn: 7200 };

    const result = await service.getLoginSuiteAccessToken(new Date("2026-07-06T10:00:00.000Z"));

    expect(result.accessToken).toBe("login-token");
    expect(api.lastRequest).toEqual({
      suiteId: config.suite.loginSuiteId,
      suiteSecret: config.suite.loginSuiteSecret,
      suiteTicket: "login-ticket-001"
    });
  });

  it("fails clearly when login authorization suite_ticket has not arrived yet", async () => {
    const { service } = createService();

    await expect(service.getLoginSuiteAccessToken()).rejects.toThrow(
      "WeCom login authorization suite_ticket is not available"
    );
  });

  it("fails clearly when suite_ticket has not arrived yet", async () => {
    const { service } = createService();

    await expect(service.getSuiteAccessToken()).rejects.toThrow("WeCom suite_ticket is not available");
  });
});

class FakeWecomApiClient {
  calls = 0;
  lastRequest: FetchSuiteTokenRequest | null = null;
  nextResponse: FetchSuiteTokenResponse = { suiteAccessToken: "default-token", expiresIn: 7200 };

  async fetchSuiteAccessToken(request: FetchSuiteTokenRequest): Promise<FetchSuiteTokenResponse> {
    this.calls += 1;
    this.lastRequest = request;
    await Promise.resolve();
    return this.nextResponse;
  }
}

function createService() {
  const config = new WecomConfigService();
  const api = new FakeWecomApiClient();
  const state = new WecomSuiteStateRepository(new DatabaseService(), new WecomStateCipherService());
  const service = new WecomSuiteTokenService(config, api as unknown as WecomApiClientService, state);
  return { service, api, state, config };
}
