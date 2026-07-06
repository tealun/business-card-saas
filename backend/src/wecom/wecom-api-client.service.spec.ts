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
});
