import { WecomSensitiveService } from "./wecom-sensitive.service.js";
import { hashSensitiveIdentity } from "./wecom-sensitive-state.repository.js";

describe("WecomSensitiveService", () => {
  const session = {
    accountId: "account-1",
    identityType: "wecom_member" as const,
    tenantId: "tenant-1",
    memberIdentityId: "member-1",
    openUserid: "open-user-1"
  };

  it("creates a third-party snsapi_privateinfo URL bound to a one-time state", async () => {
    const fixture = createFixture();

    const result = await fixture.service.createAuthorizationUrl(session);
    const startUrl = new URL(result.authorization_url);
    const state = startUrl.searchParams.get("state") ?? "";
    const url = new URL(fixture.service.createWecomOAuthUrl(state));

    expect(startUrl.origin + startUrl.pathname).toBe("https://api.example.com/api/v1/wecom/member-sensitive/start");
    expect(url.searchParams.get("appid")).toBe("wwsuite001");
    expect(url.searchParams.get("scope")).toBe("snsapi_privateinfo");
    expect(url.searchParams.has("agentid")).toBe(false);
    expect(url.searchParams.get("redirect_uri")).toBe("https://api.example.com/api/v1/wecom/member-sensitive/callback");
    expect(fixture.states.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tenantId: "tenant-1",
        memberIdentityId: "member-1",
        openCorpid: "corp-1",
        openUseridHash: hashSensitiveIdentity("open-user-1")
      }),
      expect.any(Date)
    );
  });

  it("reports sensitive profile authorization status for the current enterprise identity", async () => {
    const fixture = createFixture();

    await expect(fixture.service.getStatus(session)).resolves.toMatchObject({
      eligible: true,
      authorized: true,
      should_authorize: false
    });
    expect(fixture.cards.getWecomSensitiveStatus).toHaveBeenCalledWith(session);
  });

  it("syncs avatar and QR code only when corp and member identities match", async () => {
    const fixture = createFixture();

    await fixture.service.complete("oauth-code", "state-token");

    expect(fixture.cards.syncWecomSensitiveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", memberIdentityId: "member-1", openUserid: "open-user-1" }),
      {
        name: "张三",
        title: "销售总监",
        mobile: "13800138000",
        email: "zhangsan@example.com",
        avatarUrl: "https://images.example.com/avatar.png",
        qrCodeUrl: "https://images.example.com/qr.png"
      }
    );
  });

  it("rejects a callback for another enterprise member", async () => {
    const fixture = createFixture();
    fixture.api.fetchThirdPartyUserInfo.mockResolvedValueOnce({
      openCorpid: "corp-1",
      openUserid: "attacker",
      userTicket: "ticket",
      expiresIn: 300
    });

    await expect(fixture.service.complete("oauth-code", "state-token")).rejects.toThrow(
      "does not match the current card identity"
    );
    expect(fixture.cards.syncWecomSensitiveProfile).not.toHaveBeenCalled();
  });
});

function createFixture() {
  const states = {
    create: jest.fn(async () => undefined),
    consume: jest.fn(async () => ({
      tenantId: "tenant-1",
      memberIdentityId: "member-1",
      openCorpid: "corp-1",
      openUseridHash: hashSensitiveIdentity("open-user-1")
    }))
  };
  const api = {
    fetchThirdPartyUserInfo: jest.fn(async () => ({
      openCorpid: "corp-1",
      openUserid: "open-user-1",
      userTicket: "ticket",
      expiresIn: 300
    })),
    fetchThirdPartyUserDetail: jest.fn(async () => ({
      openCorpid: "corp-1",
      openUserid: null,
      name: "张三",
      title: "销售总监",
      mobile: "13800138000",
      email: "zhangsan@example.com",
      avatarUrl: "https://images.example.com/avatar.png",
      qrCodeUrl: "https://images.example.com/qr.png"
    }))
  };
  const cards = {
    getWecomSensitiveStatus: jest.fn(async () => ({
      eligible: true,
      authorized: true,
      should_authorize: false,
      can_authorize: true,
      synced_fields: ["profile"],
      message: "企业微信资料已授权同步"
    })),
    syncWecomSensitiveProfile: jest.fn(async () => undefined)
  };
  const service = new WecomSensitiveService(
    {
      suite: { suiteId: "wwsuite001" },
      sensitiveAuthorizationRedirectUri: "https://api.example.com/api/v1/wecom/member-sensitive/callback"
    } as never,
    states as never,
    { getByTenantId: jest.fn(async () => ({ openCorpid: "corp-1" })) } as never,
    { getSuiteAccessToken: jest.fn(async () => ({ accessToken: "suite-token" })) } as never,
    api as never,
    cards as never
  );
  return { service, states, api, cards };
}
