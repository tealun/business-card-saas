import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { AdminWecomScanAuthService } from "./admin-wecom-scan-auth.service.js";

describe("AdminWecomScanAuthService", () => {
  it("creates scan login config with a one-time state and sanitized redirect path", async () => {
    const fixture = createFixture();

    const result = await fixture.service.loginConfig({
      clientIp: "127.0.0.1",
      userAgent: "jest",
      redirectPath: "/admin/members"
    });

    expect(result).toEqual({
      appid: "wwprovider",
      redirect_uri: "https://admin.example.com/",
      login_url: expect.stringContaining("https://login.work.weixin.qq.com/wwlogin/sso/login?"),
      state: expect.stringMatching(/^[a-f0-9]{48}$/),
      expires_in: 600
    });
    const loginUrl = new URL(result.login_url);
    expect(loginUrl.searchParams.get("login_type")).toBe("ServiceApp");
    expect(loginUrl.searchParams.get("appid")).toBe("wwprovider");
    expect(loginUrl.searchParams.get("redirect_uri")).toBe("https://admin.example.com/");
    expect(loginUrl.searchParams.get("state")).toBe(result.state);
    expect(fixture.states.create).toHaveBeenCalledWith(
      expect.objectContaining({
        state: result.state,
        context: { accountType: "tenant", redirectPath: "/admin/members" },
        clientIp: "127.0.0.1",
        userAgent: "jest"
      })
    );
  });

  it("does not require full WeCom suite secrets when creating scan login config", async () => {
    const fixture = createFixture();
    Object.defineProperty(fixture.config, "suite", {
      get: () => {
        throw new Error("full suite config should not be read");
      }
    });

    await expect(
      fixture.service.loginConfig({
        clientIp: "127.0.0.1",
        userAgent: "jest",
        redirectPath: "/"
      })
    ).resolves.toMatchObject({
      appid: "wwprovider",
      redirect_uri: "https://admin.example.com/"
    });
  });

  it("returns an actionable service unavailable error when scan login env is incomplete", async () => {
    const fixture = createFixture({
      config: {
        providerCorpId: "",
        adminLoginRedirectUri: ""
      }
    });

    await expect(
      fixture.service.loginConfig({
        clientIp: "127.0.0.1",
        userAgent: "jest",
        redirectPath: "/"
      })
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      fixture.service.loginConfig({
        clientIp: "127.0.0.1",
        userAgent: "jest",
        redirectPath: "/"
      })
    ).rejects.toThrow("企业微信扫码登录配置未完成");
    expect(fixture.states.create).not.toHaveBeenCalled();
  });

  it("exchanges a WeCom scan callback for a tenant admin session", async () => {
    const fixture = createFixture();

    const result = await fixture.service.completeScan({
      code: " oauth-code ",
      state: "state-token-00000000000000000000000000000001"
    });

    expect(fixture.states.consume).toHaveBeenCalledWith("state-token-00000000000000000000000000000001");
    expect(fixture.api.fetchThirdPartyUserInfo).toHaveBeenCalledWith("suite-token", "oauth-code", {
      requireUserTicket: false
    });
    expect(fixture.api.fetchCorpAdminList).toHaveBeenCalledWith({
      suiteAccessToken: "suite-token",
      openCorpid: "corp-1",
      agentId: "100001"
    });
    expect(fixture.scanAdmins.upsertFromScan).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp",
      userid: "zhangsan",
      openUserid: "open-zhangsan"
    });
    expect(fixture.operationLogs.record).toHaveBeenCalledWith({
      session: expect.objectContaining({
        tenantId: "tenant-1",
        openUserid: "open-zhangsan",
        role: "owner",
        accountType: "tenant"
      }),
      action: "admin.login.wecom_scan.success",
      targetType: "tenant_admin",
      targetId: "open-zhangsan",
      detail: { open_corpid: "corp-1", userid: "zhangsan" }
    });
    expect(result).toEqual({
      access_token: "x".repeat(40),
      token_type: "Bearer",
      expires_in: 28800,
      admin: expect.objectContaining({
        tenant_id: "tenant-1",
        tenant_name: "Pilot Corp",
        member_identity_id: "member-1",
        open_userid: "open-zhangsan",
        role: "owner",
        account_type: "tenant"
      })
    });
  });

  it("matches scanned administrators by open userid when userid is not returned consistently", async () => {
    const fixture = createFixture();
    fixture.api.fetchThirdPartyUserInfo.mockResolvedValueOnce({
      openCorpid: "corp-1",
      userid: null,
      openUserid: "open-zhangsan",
      userTicket: null,
      expiresIn: 300
    });
    fixture.api.fetchCorpAdminList.mockResolvedValueOnce({
      admins: [{ userid: null, openUserid: "open-zhangsan", authType: 1 }]
    });

    await expect(
      fixture.service.completeScan({ code: "oauth-code", state: "state-token-00000000000000000000000000000001" })
    ).resolves.toMatchObject({
      admin: expect.objectContaining({
        open_userid: "open-zhangsan",
        account_type: "tenant"
      })
    });
    expect(fixture.scanAdmins.upsertFromScan).toHaveBeenCalledWith(
      expect.objectContaining({
        userid: "open-zhangsan",
        openUserid: "open-zhangsan"
      })
    );
  });

  it("rejects invalid or reused scan login state before calling WeCom", async () => {
    const fixture = createFixture();
    fixture.states.consume.mockResolvedValueOnce(null);

    await expect(
      fixture.service.completeScan({ code: "oauth-code", state: "state-token-00000000000000000000000000000001" })
    ).rejects.toThrow(BadRequestException);
    expect(fixture.api.fetchThirdPartyUserInfo).not.toHaveBeenCalled();
    expect(fixture.operationLogs.record).not.toHaveBeenCalled();
    expect(fixture.operationLogs.recordLoginAttempt).not.toHaveBeenCalled();
  });

  it("rejects scanned users who are not enterprise administrators", async () => {
    const fixture = createFixture();
    fixture.api.fetchCorpAdminList.mockResolvedValueOnce({ admins: [{ userid: "lisi", openUserid: null, authType: 1 }] });

    await expect(
      fixture.service.completeScan({ code: "oauth-code", state: "state-token-00000000000000000000000000000001" })
    ).rejects.toThrow(ForbiddenException);
    expect(fixture.scanAdmins.upsertFromScan).not.toHaveBeenCalled();
    expect(fixture.operationLogs.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorOpenUserid: "open-zhangsan",
        action: "admin.login.wecom_scan.failed",
        targetId: "zhangsan",
        detail: expect.objectContaining({ reason: "not_enterprise_admin", userid: "zhangsan" })
      })
    );
  });

  it("rejects scanned administrators without management permission", async () => {
    const fixture = createFixture();
    fixture.api.fetchCorpAdminList.mockResolvedValueOnce({
      admins: [{ userid: "zhangsan", openUserid: "open-zhangsan", authType: 0 }]
    });

    await expect(
      fixture.service.completeScan({ code: "oauth-code", state: "state-token-00000000000000000000000000000001" })
    ).rejects.toThrow(ForbiddenException);
    expect(fixture.scanAdmins.upsertFromScan).not.toHaveBeenCalled();
    expect(fixture.operationLogs.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        action: "admin.login.wecom_scan.failed",
        targetId: "zhangsan",
        detail: expect.objectContaining({ reason: "no_management_permission", auth_type: 0 })
      })
    );
  });

  it("lets the local disabled admin status override WeCom administrator status", async () => {
    const fixture = createFixture();
    fixture.scanAdmins.upsertFromScan.mockResolvedValueOnce({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-1",
      openUserid: "open-zhangsan",
      role: "owner",
      status: "disabled"
    });

    await expect(
      fixture.service.completeScan({ code: "oauth-code", state: "state-token-00000000000000000000000000000001" })
    ).rejects.toThrow(ForbiddenException);
    expect(fixture.sessionTokens.sign).not.toHaveBeenCalled();
    expect(fixture.operationLogs.recordLoginAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorOpenUserid: "open-zhangsan",
        action: "admin.login.wecom_scan.failed",
        targetId: "zhangsan",
        detail: expect.objectContaining({ reason: "local_admin_disabled" })
      })
    );
  });
});

function createFixture(overrides: { config?: Partial<{ providerCorpId: string; adminLoginRedirectUri: string }> } = {}) {
  const config = {
    providerCorpId: overrides.config?.providerCorpId ?? "wwprovider",
    suite: { providerCorpId: "wwprovider", suiteId: "wwsuite" },
    adminLoginRedirectUri: overrides.config?.adminLoginRedirectUri ?? "https://admin.example.com/"
  };
  const states = {
    create: jest.fn(async () => undefined),
    consume: jest.fn<Promise<{ accountType: "tenant"; redirectPath: string | null } | null>, [string]>(
      async () => ({ accountType: "tenant", redirectPath: null })
    )
  };
  const suiteTokens = { getSuiteAccessToken: jest.fn(async () => ({ accessToken: "suite-token" })) };
  const api = {
    fetchThirdPartyUserInfo: jest.fn<
      Promise<{
        openCorpid: string;
        userid: string | null;
        openUserid: string;
        userTicket: string | null;
        expiresIn: number;
      }>,
      [string, string, { requireUserTicket?: boolean }]
    >(async () => ({
      openCorpid: "corp-1",
      userid: "zhangsan",
      openUserid: "open-zhangsan",
      userTicket: null,
      expiresIn: 300
    })),
    fetchCorpAdminList: jest.fn<
      Promise<{ admins: Array<{ userid: string | null; openUserid: string | null; authType: 0 | 1 }> }>,
      [{ suiteAccessToken: string; openCorpid: string; agentId: string }]
    >(async () => ({ admins: [{ userid: "zhangsan", openUserid: "open-zhangsan", authType: 1 }] }))
  };
  const tenants = {
    getByOpenCorpid: jest.fn(async () => ({
      tenantId: "tenant-1",
      corpName: "Pilot Corp",
      openCorpid: "corp-1",
      permanentCode: "permanent-code",
      agentId: "100001",
      authStatus: "active"
    }))
  };
  const scanAdmins = {
    upsertFromScan: jest.fn<
      Promise<{
        tenantId: string;
        tenantName: string;
        memberIdentityId: string | null;
        openUserid: string;
        role: "owner" | "admin" | "operator" | "auditor";
        status: "active" | "disabled";
      }>,
      [
        {
          tenantId: string;
          tenantName: string;
          userid: string;
          openUserid: string;
        }
      ]
    >(async () => ({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-1",
      openUserid: "open-zhangsan",
      role: "owner",
      status: "active"
    }))
  };
  const sessionTokens = {
    expiresIn: 28800,
    sign: jest.fn(() => "x".repeat(40))
  };
  const operationLogs = {
    record: jest.fn(async () => undefined),
    recordLoginAttempt: jest.fn(async () => undefined)
  };
  const service = new AdminWecomScanAuthService(
    config as never,
    states as never,
    suiteTokens as never,
    api as never,
    tenants as never,
    scanAdmins as never,
    sessionTokens as never,
    operationLogs as never
  );

  return { service, config, states, suiteTokens, api, tenants, scanAdmins, sessionTokens, operationLogs };
}
