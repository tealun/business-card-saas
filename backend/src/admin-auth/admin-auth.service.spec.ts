import { ForbiddenException } from "@nestjs/common";
import { OwnerBootstrapRepository } from "../admin-bootstrap/owner-bootstrap.repository.js";
import type { WecomMiniProgramIdentity, WecomMiniProgramLoginService } from "../wecom/wecom-miniprogram-login.service.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";

describe("AdminAuthService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("logs in an active tenant admin and returns a verifiable admin session", async () => {
    const admins = new OwnerBootstrapRepository();
    admins.createOwner({
      tenantId: "tenant-001",
      memberIdentityId: "member-001",
      openUserid: "ou-admin"
    });
    const tokens = new AdminSessionTokenService();
    const service = new AdminAuthService(createWecomLogin("ou-admin"), admins, tokens);

    const response = await service.qyLogin({ code: "admin-code" });

    expect(response.admin).toEqual({
      tenant_id: "tenant-001",
      tenant_name: "Pilot Corp",
      member_identity_id: "member-001",
      open_userid: "ou-admin",
      role: "owner"
    });
    expect(tokens.verify(response.access_token)).toEqual({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      openUserid: "ou-admin",
      role: "owner"
    });
    expect(service.me(tokens.verify(response.access_token)).admin.role).toBe("owner");
  });

  it("rejects a WeCom user who is not a tenant admin", async () => {
    const service = new AdminAuthService(
      createWecomLogin("ou-employee"),
      new OwnerBootstrapRepository(),
      new AdminSessionTokenService()
    );

    await expect(service.qyLogin({ code: "employee-code" })).rejects.toThrow(ForbiddenException);
  });
});

function createWecomLogin(openUserid: string): WecomMiniProgramLoginService {
  return {
    resolveJsCode: jest.fn(async (): Promise<WecomMiniProgramIdentity> => ({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: openUserid,
      openCorpid: "corp-001",
      openUserid,
      publicId: "pub_admin0001",
      sessionKey: "session-key"
    }))
  } as unknown as WecomMiniProgramLoginService;
}
