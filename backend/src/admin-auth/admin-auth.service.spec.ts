import { ForbiddenException } from "@nestjs/common";
import { OwnerBootstrapRepository } from "../admin-bootstrap/owner-bootstrap.repository.js";
import { OwnerBootstrapService } from "../admin-bootstrap/owner-bootstrap.service.js";
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
    const bootstrap = new OwnerBootstrapService(admins);
    await admins.createOwner({
      tenantId: "tenant-001",
      memberIdentityId: "member-001",
      openUserid: "ou-admin"
    });
    const tokens = new AdminSessionTokenService();
    const service = new AdminAuthService(createWecomLogin("ou-admin"), admins, tokens, bootstrap);

    const response = await service.qyLogin({ code: "admin-code" });

    expect(response.admin).toEqual({
      tenant_id: "tenant-001",
      tenant_name: "Pilot Corp",
      member_identity_id: "member-001",
      open_userid: "ou-admin",
      role: "owner",
      account_type: "tenant"
    });
    expect(tokens.verify(response.access_token)).toEqual({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      openUserid: "ou-admin",
      role: "owner",
      accountType: "tenant"
    });
    expect(service.me(tokens.verify(response.access_token)).admin.role).toBe("owner");
  });

  it("claims the first tenant owner during admin login with a valid claim token", async () => {
    const admins = new OwnerBootstrapRepository();
    const bootstrap = new OwnerBootstrapService(admins);
    const token = new AdminSessionTokenService();
    const claim = await bootstrap.bootstrapOwner({ tenant_id: "tenant-001" });
    if (claim.mode !== "claim_token_created") {
      throw new Error("expected claim token result");
    }
    const service = new AdminAuthService(createWecomLogin("ou-claimed"), admins, token, bootstrap);

    const response = await service.qyLogin({ code: "admin-code", claim_token: claim.claim_token });

    expect(response.admin).toEqual({
      tenant_id: "tenant-001",
      tenant_name: "Pilot Corp",
      member_identity_id: "member-001",
      open_userid: "ou-claimed",
      role: "owner",
      account_type: "tenant"
    });
    expect(admins.findClaimToken(bootstrap.hashClaimToken(claim.claim_token))?.usedAt).toBeInstanceOf(Date);
    await expect(admins.findActiveAdmin({ tenantId: "tenant-001", openUserid: "ou-claimed" })).resolves.toEqual({
      tenantId: "tenant-001",
      memberIdentityId: "member-001",
      openUserid: "ou-claimed",
      role: "owner"
    });
  });

  it("rejects invalid claim tokens during admin login", async () => {
    const admins = new OwnerBootstrapRepository();
    const bootstrap = new OwnerBootstrapService(admins);
    const service = new AdminAuthService(
      createWecomLogin("ou-employee"),
      admins,
      new AdminSessionTokenService(),
      bootstrap
    );

    await expect(service.qyLogin({ code: "employee-code", claim_token: "admclaim_invalidtokenvalue0000000000" })).rejects.toThrow(
      ForbiddenException
    );
  });

  it("rejects a WeCom user who is not a tenant admin", async () => {
    const admins = new OwnerBootstrapRepository();
    const service = new AdminAuthService(
      createWecomLogin("ou-employee"),
      admins,
      new AdminSessionTokenService(),
      new OwnerBootstrapService(admins)
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
