import { UnauthorizedException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "./admin-auth.guard.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { PlatformAdminRepository } from "./platform-admin.repository.js";
import { PlatformAdminService } from "./platform-admin.service.js";
import { hashPassword } from "./password.util.js";
import type { AdminSession } from "./admin-session.js";

describe("AdminAuthGuard", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  function createGuard() {
    const repository = new PlatformAdminRepository();
    const tokens = new AdminSessionTokenService();
    const platformAdmins = new PlatformAdminService(repository, tokens);
    const tenantAdmins = { findActiveAdmin: jest.fn(async () => ({ tenantId:"tenant-001",memberIdentityId:"member-001",openUserid:"ou-owner",role:"owner" })) };
    const guard = new AdminAuthGuard(tokens, platformAdmins, tenantAdmins as never);
    return { repository, tokens, platformAdmins, tenantAdmins, guard };
  }

  const tenantSession: AdminSession = {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "owner"
  };

  function context(auth?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: auth } })
      })
    } as ExecutionContext;
  }

  async function createPlatformAccount(guard_context: ReturnType<typeof createGuard>, username = "root") {
    await guard_context.repository.createWithBootstrapTenant({
      username,
      passwordHash: hashPassword("initial-password-1"),
      tenantName: "平台运营"
    });
    return {
      tenantId: "platform-1",
      tenantName: "平台运营",
      memberIdentityId: null,
      openUserid: `platform:${username}`,
      role: "platform_owner",
      accountType: "platform"
    } satisfies AdminSession;
  }

  it("allows tenant-session requests only while the tenant admin is active", async () => {
    const { tokens, guard,tenantAdmins } = createGuard();
    const token = tokens.sign(tenantSession);
    await expect(guard.canActivate(context(`Bearer ${token}`))).resolves.toBe(true);
    expect(tenantAdmins.findActiveAdmin).toHaveBeenCalledWith({tenantId:"tenant-001",openUserid:"ou-owner"});
  });

  it("attaches Fastify's resolved client ip to the verified session for audit logging", async () => {
    const { tokens, guard } = createGuard();
    const token = tokens.sign(tenantSession);
    const request: AdminRequest & { headers: Record<string, string>; ip: string } = {
      headers: { authorization: `Bearer ${token}` },
      ip: "198.51.100.4"
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request
      })
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.adminSession?.requestIp).toBe("198.51.100.4");
  });

  it("does not trust a client-supplied X-Forwarded-For header directly (only request.ip, Fastify's trust-proxy-resolved value, is used)", async () => {
    const { tokens, guard } = createGuard();
    const token = tokens.sign(tenantSession);
    // Fastify only folds X-Forwarded-For into request.ip when the peer is a trusted proxy
    // (trustProxy: "loopback"); a raw header on the request object here must never be read.
    const request: AdminRequest & { headers: Record<string, string>; ip: string } = {
      headers: { authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      ip: "198.51.100.4"
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request
      })
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.adminSession?.requestIp).toBe("198.51.100.4");
  });

  it("throws when the authorization header is missing", async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(context())).rejects.toThrow(UnauthorizedException);
  });

  it("throws when the token is malformed", async () => {
    const { guard } = createGuard();
    await expect(guard.canActivate(context("Bearer not-a-token"))).rejects.toThrow(UnauthorizedException);
  });

  // M1-S7 (01_09 AC6): platform sessions are re-checked against platform_admins
  // on every request, so disable/delete revokes outstanding 8h tokens at once.
  it("allows a platform session whose account is still active", async () => {
    const setup = createGuard();
    const session = await createPlatformAccount(setup);
    const token = setup.tokens.sign(session);
    await expect(setup.guard.canActivate(context(`Bearer ${token}`))).resolves.toBe(true);
  });

  it("rejects a platform session once the account is disabled", async () => {
    const setup = createGuard();
    const session = await createPlatformAccount(setup);
    const token = setup.tokens.sign(session);
    const findByUsername = jest.spyOn(setup.repository, "findByUsername");
    findByUsername.mockResolvedValue({
      id: "1",
      username: "root",
      passwordHash: "scrypt:x",
      tenantId: "platform-1",
      tenantName: "平台运营",
      role: "platform_owner",
      status: "disabled"
    });
    await expect(setup.guard.canActivate(context(`Bearer ${token}`))).rejects.toThrow(UnauthorizedException);
    expect(findByUsername).toHaveBeenCalledWith("root");
  });

  it("rejects a platform session once the account is deleted", async () => {
    const setup = createGuard();
    const session = await createPlatformAccount(setup);
    const token = setup.tokens.sign(session);
    jest.spyOn(setup.repository, "findByUsername").mockResolvedValue(null);
    await expect(setup.guard.canActivate(context(`Bearer ${token}`))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an outstanding tenant token after the tenant admin is disabled", async () => {
    const setup = createGuard();
    (setup.tenantAdmins.findActiveAdmin as jest.Mock).mockResolvedValue(null);
    const token = setup.tokens.sign({ ...tenantSession, accountType: "tenant" });
    await expect(setup.guard.canActivate(context(`Bearer ${token}`))).rejects.toThrow(UnauthorizedException);
  });

  it("rejects an outstanding tenant token after the tenant admin role changes", async () => {
    const setup = createGuard();
    setup.tenantAdmins.findActiveAdmin.mockResolvedValue({...await setup.tenantAdmins.findActiveAdmin(),role:"admin"});
    const token = setup.tokens.sign({ ...tenantSession, accountType: "tenant" });
    await expect(setup.guard.canActivate(context(`Bearer ${token}`))).rejects.toThrow(UnauthorizedException);
  });

  it("keeps legacy active tenant admins without a persisted member id compatible",async()=>{
    const setup=createGuard();
    setup.tenantAdmins.findActiveAdmin.mockResolvedValue({...await setup.tenantAdmins.findActiveAdmin(),memberIdentityId:null} as never);
    const token=setup.tokens.sign({...tenantSession,accountType:"tenant"});
    await expect(setup.guard.canActivate(context(`Bearer ${token}`))).resolves.toBe(true);
  });
});
