import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { hashPassword, verifyPassword } from "./password.util.js";
import { PlatformAdminRepository } from "./platform-admin.repository.js";
import { PlatformAdminService } from "./platform-admin.service.js";

describe("password.util", () => {
  it("verifies a hashed password and rejects wrong ones", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(hash.startsWith("scrypt:")).toBe(true);
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong password", hash)).toBe(false);
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });

  it("produces unique salts", () => {
    expect(hashPassword("same")).not.toEqual(hashPassword("same"));
  });
});

describe("PlatformAdminService", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalBootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME;
  const originalBootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_BOOTSTRAP_USERNAME;
    delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalBootstrapUsername) {
      process.env.ADMIN_BOOTSTRAP_USERNAME = originalBootstrapUsername;
    }
    if (originalBootstrapPassword) {
      process.env.ADMIN_BOOTSTRAP_PASSWORD = originalBootstrapPassword;
    }
  });

  function createService() {
    const repository = new PlatformAdminRepository();
    const tokens = new AdminSessionTokenService();
    const service = new PlatformAdminService(repository, tokens);
    return { repository, tokens, service };
  }

  it("bootstraps the super admin from env once and logs in with password", async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = "root";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "initial-password-1";
    const { repository, tokens, service } = createService();

    await service.onApplicationBootstrap();
    const created = await repository.findByUsername("root");
    expect(created).not.toBeNull();

    // Second bootstrap must not overwrite the existing account.
    await repository.updatePassword("root", hashPassword("changed-password-1"));
    await service.onApplicationBootstrap();
    const response = await service.passwordLogin({ username: "root", password: "changed-password-1" });

    expect(response.admin.role).toBe("platform_owner");
    expect(response.admin.open_userid).toBe("platform:root");
    expect(response.admin.permissions).toEqual(
      expect.arrayContaining(["platform.tenant.read", "platform.feature.write", "platform.database.migrate"])
    );
    expect(response.admin.menu_scopes).toEqual(
      expect.arrayContaining(["platform.dashboard", "platform.tenants", "platform.ops", "platform.accounts"])
    );
    expect(tokens.verify(response.access_token).openUserid).toBe("platform:root");
  });

  it("rejects wrong passwords and unknown usernames alike", async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = "root";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "initial-password-1";
    const { service } = createService();
    await service.onApplicationBootstrap();

    await expect(service.passwordLogin({ username: "root", password: "nope" })).rejects.toThrow(UnauthorizedException);
    await expect(service.passwordLogin({ username: "ghost", password: "nope" })).rejects.toThrow(UnauthorizedException);
  });

  it("changes the password only with the correct current password", async () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = "root";
    process.env.ADMIN_BOOTSTRAP_PASSWORD = "initial-password-1";
    const { tokens, service } = createService();
    await service.onApplicationBootstrap();

    const login = await service.passwordLogin({ username: "root", password: "initial-password-1" });
    const session = tokens.verify(login.access_token);

    await expect(
      service.changePassword(session, { old_password: "wrong", new_password: "next-password-1" })
    ).rejects.toThrow(UnauthorizedException);

    await service.changePassword(session, { old_password: "initial-password-1", new_password: "next-password-1" });
    await expect(service.passwordLogin({ username: "root", password: "initial-password-1" })).rejects.toThrow(
      UnauthorizedException
    );
    const relogin = await service.passwordLogin({ username: "root", password: "next-password-1" });
    expect(relogin.admin.open_userid).toBe("platform:root");
  });

  it("refuses password change for non-platform (WeCom) admin sessions", async () => {
    const { service } = createService();
    await expect(
      service.changePassword(
        {
          tenantId: "1",
          tenantName: "T",
          memberIdentityId: null,
          openUserid: "ou-wecom-admin",
          role: "owner"
        },
        { old_password: "a", new_password: "long-enough-1" }
      )
    ).rejects.toThrow(BadRequestException);
  });
});


describe("PlatformAdminService account management (M1-S4)", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalBootstrapUsername = process.env.ADMIN_BOOTSTRAP_USERNAME;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.ADMIN_BOOTSTRAP_USERNAME;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalBootstrapUsername) {
      process.env.ADMIN_BOOTSTRAP_USERNAME = originalBootstrapUsername;
    }
  });

  function createService() {
    const repository = new PlatformAdminRepository();
    const tokens = new AdminSessionTokenService();
    const service = new PlatformAdminService(repository, tokens);
    return { repository, tokens, service };
  }

  it("creates an ops account with a scrypt hash that can log in immediately", async () => {
    const { repository, service } = createService();

    const summary = await service.createPlatformAccount({
      username: "ops.one",
      password: "password-001",
      role: "ops",
      createdBy: "root"
    });

    expect(summary).toMatchObject({ username: "ops.one", role: "ops", status: "active" });
    const stored = await repository.findByUsername("ops.one");
    expect(stored?.passwordHash.startsWith("scrypt:")).toBe(true);
    expect(stored?.passwordHash).not.toContain("password-001");

    const login = await service.passwordLogin({ username: "ops.one", password: "password-001" });
    expect(login.admin.role).toBe("ops");
    expect(login.admin.account_type).toBe("platform");
    expect(login.admin.permissions).toContain("platform.feature.write");
    expect(login.admin.permissions).not.toContain("platform.account.write");
    expect(login.admin.menu_scopes).not.toContain("platform.accounts");
  });

  it("rejects usernames outside the allowed charset", async () => {
    const { service } = createService();
    await expect(
      service.createPlatformAccount({ username: "bad name!", password: "password-001", role: "ops", createdBy: "root" })
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.createPlatformAccount({ username: "ab", password: "password-001", role: "ops", createdBy: "root" })
    ).rejects.toThrow("用户名需为 3-64 位");
  });

  it("enforces the password policy: at least 10 chars with letters and digits", async () => {
    const { service } = createService();
    const attempt = (password: string) =>
      service.createPlatformAccount({ username: "ops.one", password, role: "ops", createdBy: "root" });

    await expect(attempt("short-1")).rejects.toThrow("密码至少 10 位，且需同时包含字母和数字");
    await expect(attempt("onlyletters")).rejects.toThrow("密码至少 10 位，且需同时包含字母和数字");
    await expect(attempt("12345678901")).rejects.toThrow("密码至少 10 位，且需同时包含字母和数字");
    await expect(attempt("valid-pass-1")).resolves.toMatchObject({ username: "ops.one" });
  });

  it("rejects duplicate usernames with a 409-friendly error", async () => {
    const { service } = createService();
    await service.createPlatformAccount({ username: "ops.one", password: "password-001", role: "ops", createdBy: "root" });

    await expect(
      service.createPlatformAccount({ username: "ops.one", password: "password-002", role: "support", createdBy: "root" })
    ).rejects.toThrow(ConflictException);
    await expect(
      service.createPlatformAccount({ username: "ops.one", password: "password-002", role: "support", createdBy: "root" })
    ).rejects.toThrow("用户名已存在");
  });

  it("exposes the bootstrap username from env for protection checks", () => {
    process.env.ADMIN_BOOTSTRAP_USERNAME = "root";
    const { service } = createService();
    expect(service.getBootstrapUsername()).toBe("root");
  });

  it("updates roles unless the target username is protected", async () => {
    const { service } = createService();
    const created = await service.createPlatformAccount({
      username: "ops.one",
      password: "password-001",
      role: "ops",
      createdBy: "root"
    });

    const updated = await service.updateAccountRole(created.admin_id, "support", ["root"]);
    expect(updated?.role).toBe("support");

    await expect(service.updateAccountRole(created.admin_id, "ops", ["ops.one"])).resolves.toBeNull();
    await expect(service.updateAccountRole("999", "ops", [])).resolves.toBeNull();
  });

  it("hard-deletes accounts unless the target username is protected", async () => {
    const { repository, service } = createService();
    const created = await service.createPlatformAccount({
      username: "ops.one",
      password: "password-001",
      role: "ops",
      createdBy: "root"
    });

    await expect(service.deleteAccount(created.admin_id, ["ops.one"])).resolves.toBe(false);
    await expect(service.deleteAccount(created.admin_id, ["root"])).resolves.toBe(true);
    await expect(repository.findByUsername("ops.one")).resolves.toBeNull();
  });

  it("assertActiveSessionAccount passes active accounts and rejects disabled or deleted ones", async () => {
    const { repository, service } = createService();
    await service.createPlatformAccount({ username: "ops.one", password: "password-001", role: "ops", createdBy: "root" });
    const session = {
      tenantId: "platform-1",
      tenantName: "平台运营",
      memberIdentityId: null,
      openUserid: "platform:ops.one",
      role: "ops",
      accountType: "platform"
    } as const;

    await expect(service.assertActiveSessionAccount(session)).resolves.toBeUndefined();

    jest.spyOn(repository, "findByUsername").mockResolvedValue(null);
    await expect(service.assertActiveSessionAccount(session)).rejects.toThrow(UnauthorizedException);
  });

  it("assertActiveSessionAccount ignores non-password platform identities", async () => {
    const { service } = createService();
    await expect(
      service.assertActiveSessionAccount({
        tenantId: "platform-1",
        tenantName: "平台运营",
        memberIdentityId: null,
        openUserid: "ou-something-else",
        role: "platform_owner",
        accountType: "platform"
      })
    ).resolves.toBeUndefined();
  });
});
