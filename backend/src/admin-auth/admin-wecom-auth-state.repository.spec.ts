import { AdminWecomAuthStateRepository } from "./admin-wecom-auth-state.repository.js";

describe("AdminWecomAuthStateRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("stores only a one-time consumable scan login state in memory without database", async () => {
    const repository = new AdminWecomAuthStateRepository();

    await repository.create({
      state: "state-token-00000000000000000000000000000001",
      context: { accountType: "tenant", redirectPath: "/admin/members" },
      expiresAt: new Date(Date.now() + 60_000),
      clientIp: "127.0.0.1",
      userAgent: "jest"
    });

    await expect(repository.consume("state-token-00000000000000000000000000000001")).resolves.toEqual({
      accountType: "tenant",
      redirectPath: "/admin/members"
    });
    await expect(repository.consume("state-token-00000000000000000000000000000001")).resolves.toBeNull();
  });

  it("rejects expired scan login states", async () => {
    const repository = new AdminWecomAuthStateRepository();

    await repository.create({
      state: "expired-state-000000000000000000000000000001",
      context: { accountType: "tenant", redirectPath: null },
      expiresAt: new Date(Date.now() - 1_000),
      clientIp: null,
      userAgent: null
    });

    await expect(repository.consume("expired-state-000000000000000000000000000001")).resolves.toBeNull();
  });
});
