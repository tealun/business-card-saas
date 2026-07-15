import { UnauthorizedException } from "@nestjs/common";
import { WecomAuthorizationLinkService } from "./wecom-authorization-link.service.js";
import type { WecomApiClientService } from "./wecom-api-client.service.js";
import type { WecomConfigService } from "./wecom-config.service.js";
import type { WecomSuiteTokenService } from "./wecom-suite-token.service.js";

describe("WecomAuthorizationLinkService", () => {
  it("rejects missing or invalid launch tokens", async () => {
    const { service } = createService();

    await expect(service.createAuthorizationLink({ auth_type: "official" }, "wrong-token")).rejects.toThrow(
      UnauthorizedException
    );
  });

  it("creates a tenant authorization URL after preparing WeCom session info", async () => {
    const { service, api, suiteTokens } = createService();

    const result = await service.createAuthorizationLink(
      {
        redirect_uri: "https://admin.example.com/wecom/complete",
        state: "state_001",
        auth_type: "test",
        app_ids: ["100001"]
      },
      "launch-secret"
    );

    expect(suiteTokens.getSuiteAccessToken).toHaveBeenCalledTimes(1);
    expect(api.fetchPreAuthCode).toHaveBeenCalledWith({ suiteAccessToken: "suite-token" });
    expect(api.setSessionInfo).toHaveBeenCalledWith({
      suiteAccessToken: "suite-token",
      preAuthCode: "pre-auth-code",
      authType: 1,
      appIds: ["100001"]
    });

    const url = new URL(result.authorization_url);
    expect(url.origin + url.pathname).toBe("https://open.work.weixin.qq.com/3rdapp/install");
    expect(url.searchParams.get("suite_id")).toBe("suite-id");
    expect(url.searchParams.get("pre_auth_code")).toBe("pre-auth-code");
    expect(url.searchParams.get("redirect_uri")).toBe("https://admin.example.com/wecom/complete");
    expect(url.searchParams.get("state")).toBe("state_001");
    expect(result).toMatchObject({
      suite_id: "suite-id",
      pre_auth_code_expires_in: 600,
      redirect_uri: "https://admin.example.com/wecom/complete",
      state: "state_001",
      auth_type: "test"
    });
    expect(service.consumeState("state_001")).toBe("state_001");
    expect(() => service.consumeState("state_001")).toThrow(UnauthorizedException);
  });
});

function createService() {
  const config = {
    authorizationLaunchToken: "launch-secret",
    authorizationInstallBaseUrl: "https://open.work.weixin.qq.com/3rdapp/install",
    authorizationRedirectUri: "https://admin.example.com/default-complete",
    suite: {
      suiteId: "suite-id"
    }
  } as WecomConfigService;
  const suiteTokens = {
    getSuiteAccessToken: jest.fn(async () => ({
      accessToken: "suite-token",
      expiresAt: new Date(Date.now() + 60_000)
    }))
  } as unknown as jest.Mocked<WecomSuiteTokenService>;
  const api = {
    fetchPreAuthCode: jest.fn(async () => ({
      preAuthCode: "pre-auth-code",
      expiresIn: 600
    })),
    setSessionInfo: jest.fn(async () => undefined)
  } as unknown as jest.Mocked<WecomApiClientService>;

  return {
    service: new WecomAuthorizationLinkService(config, suiteTokens, api),
    suiteTokens,
    api
  };
}
