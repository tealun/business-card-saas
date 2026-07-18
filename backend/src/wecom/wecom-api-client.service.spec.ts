import { BadGatewayException, ServiceUnavailableException } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomConfigService } from "./wecom-config.service.js";

describe("WecomApiClientService", () => {
  const originalFetch = global.fetch;
  const request = {
    suiteId: "suite-id",
    suiteSecret: "suite-secret",
    suiteTicket: "suite-ticket"
  };

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("posts get_suite_token with a timeout signal and maps successful payloads", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ errcode: 0, suite_access_token: "suite-token", expires_in: 7200 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchSuiteAccessToken(request);

    expect(result).toEqual({ suiteAccessToken: "suite-token", expiresIn: 7200 });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called with request init");
    }
    const init = firstCall[1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      suite_id: "suite-id",
      suite_secret: "suite-secret",
      suite_ticket: "suite-ticket"
    });
  });

  it("maps network failures to service unavailable", async () => {
    global.fetch = jest.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    await expect(new WecomApiClientService(new WecomConfigService()).fetchSuiteAccessToken(request)).rejects.toThrow(
      ServiceUnavailableException
    );
  });

  it("rejects malformed WeCom JSON payloads", async () => {
    global.fetch = jest.fn(async () => new Response("not-json", { status: 200 })) as unknown as typeof fetch;

    await expect(new WecomApiClientService(new WecomConfigService()).fetchSuiteAccessToken(request)).rejects.toThrow(
      BadGatewayException
    );
  });

  it("posts get_pre_auth_code and maps successful payloads", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ errcode: 0, pre_auth_code: "pre-auth-code", expires_in: 600 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchPreAuthCode({
      suiteAccessToken: "suite-token"
    });

    expect(result).toEqual({ preAuthCode: "pre-auth-code", expiresIn: 600 });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called with request init");
    }
    const [url, init] = firstCall;
    expect(url).toContain("get_pre_auth_code");
    expect(url).toContain("suite_access_token=suite-token");
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("posts set_session_info with auth type and optional app ids", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ errcode: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await new WecomApiClientService(new WecomConfigService()).setSessionInfo({
      suiteAccessToken: "suite-token",
      preAuthCode: "pre-auth-code",
      authType: 1,
      appIds: ["100001"]
    });

    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called with request init");
    }
    const [url, init] = firstCall;
    expect(url).toContain("set_session_info");
    expect(JSON.parse(String(init.body))).toEqual({
      pre_auth_code: "pre-auth-code",
      session_info: {
        auth_type: 1,
        appid: ["100001"]
      }
    });
  });

  it("posts get_corp_token and maps successful payloads", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ errcode: 0, access_token: "corp-token", expires_in: 7200 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchCorpAccessToken({
      suiteAccessToken: "suite-token",
      openCorpid: "corp-001",
      permanentCode: "perm-001"
    });

    expect(result).toEqual({ accessToken: "corp-token", expiresIn: 7200 });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called with request init");
    }
    const [url, init] = firstCall;
    expect(url).toContain("suite_access_token=suite-token");
    expect(JSON.parse(String(init.body))).toEqual({
      auth_corpid: "corp-001",
      permanent_code: "perm-001"
    });
  });

  it("posts get_auth_info and verifies the returned enterprise identity", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          errcode: 0,
          auth_corp_info: { corpid: "corp-001", corp_name: "Pilot Corp" },
          auth_info: { agent: [{ agentid: 100001 }] }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchAuthorizationInfo({
      suiteAccessToken: "suite-token",
      openCorpid: "corp-001",
      permanentCode: "perm-001"
    });

    expect(result).toEqual({
      openCorpid: "corp-001",
      corpName: "Pilot Corp",
      agentId: "100001",
      authInfo: { agent: [{ agentid: 100001 }] }
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("get_auth_info?suite_access_token=suite-token");
    expect(JSON.parse(String(init.body))).toEqual({ auth_corpid: "corp-001", permanent_code: "perm-001" });
  });

  it("posts miniprogram jscode2session and maps open_userid payloads", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({ errcode: 0, open_corpid: "corp-001", open_userid: "ou-001", session_key: "session-key" }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchMiniProgramSession({
      suiteAccessToken: "suite-token",
      jsCode: "js-code"
    });

    expect(result).toEqual({ openCorpid: "corp-001", openUserid: "ou-001", sessionKey: "session-key" });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called with request init");
    }
    const [url, init] = firstCall;
    expect(url).toContain("suite_access_token=suite-token");
    expect(JSON.parse(String(init.body))).toEqual({
      js_code: "js-code",
      grant_type: "authorization_code"
    });
  });

  it("posts contact user list_id and maps optional identity fields", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          errcode: 0,
          next_cursor: "cursor-2",
          dept_user: [
            { userid: "user-001", open_userid: "ou-001", name: "Ada", department: [1, "2"] },
            { userid: "user-002", department: [] }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchContactUserIds({
      accessToken: "corp-token",
      cursor: "cursor-1",
      limit: 500
    });

    expect(result).toEqual({
      users: [
        { userid: "user-001", openUserid: "ou-001", name: "Ada", departmentIds: ["1", "2"] },
        { userid: "user-002", openUserid: null, name: null, departmentIds: [] }
      ],
      nextCursor: "cursor-2"
    });
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const firstCall = calls[0];
    if (!firstCall) {
      throw new Error("fetch was not called with request init");
    }
    const [url, init] = firstCall;
    expect(url).toContain("access_token=corp-token");
    expect(JSON.parse(String(init.body))).toEqual({ cursor: "cursor-1", limit: 500 });
  });

  it("exchanges third-party OAuth code and user ticket for avatar and QR code", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ CorpId: "corp-1", open_userid: "open-user-1", user_ticket: "ticket", expires_in: 300 }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            errcode: 0,
            corpid: "corp-1",
            userid: "internal-user-1",
            avatar: "http://images.example.com/avatar.png",
            qr_code: "https://images.example.com/qr.png"
          }),
          { status: 200 }
        )
      );
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new WecomApiClientService(new WecomConfigService());

    const identity = await service.fetchThirdPartyUserInfo("suite-token", "oauth-code");
    if (!identity.userTicket) {
      throw new Error("expected user ticket");
    }
    const detail = await service.fetchThirdPartyUserDetail("suite-token", identity.userTicket);

    expect(identity).toMatchObject({
      openCorpid: "corp-1",
      userid: null,
      openUserid: "open-user-1",
      userTicket: "ticket"
    });
    expect(detail).toEqual({
      openCorpid: "corp-1",
      openUserid: "internal-user-1",
      avatarUrl: "https://images.example.com/avatar.png",
      qrCodeUrl: "https://images.example.com/qr.png"
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/cgi-bin/service/auth/getuserinfo3rd");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/cgi-bin/service/getuserdetail3rd");
  });

  it("allows third-party OAuth user info without user ticket for scan login", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify({ errcode: 0, corpid: "corp-1", userid: "zhangsan", expires_in: 300 }), {
        status: 200
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchThirdPartyUserInfo(
      "suite-token",
      "oauth-code",
      { requireUserTicket: false }
    );

    expect(result).toEqual({
      openCorpid: "corp-1",
      userid: "zhangsan",
      openUserid: "zhangsan",
      userTicket: null,
      expiresIn: 300
    });
  });

  it("posts get_admin_list and maps admin management permissions", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify({
          errcode: 0,
          admin: [{ userid: "zhangsan", auth_type: 1 }, { userid: "lisi", auth_type: 0 }, { auth_type: 1 }]
        }),
        { status: 200 }
      )
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new WecomApiClientService(new WecomConfigService()).fetchCorpAdminList({
      accessToken: "corp-token"
    });

    expect(result).toEqual({
      admins: [
        { userid: "zhangsan", authType: 1 },
        { userid: "lisi", authType: 0 }
      ]
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/cgi-bin/agent/get_admin_list?access_token=corp-token");
    expect(JSON.parse(String(init.body))).toEqual({});
  });
});
