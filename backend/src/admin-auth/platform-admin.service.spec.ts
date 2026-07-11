import { BadRequestException, UnauthorizedException } from "@nestjs/common";
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

    expect(response.admin.role).toBe("owner");
    expect(response.admin.open_userid).toBe("platform:root");
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
