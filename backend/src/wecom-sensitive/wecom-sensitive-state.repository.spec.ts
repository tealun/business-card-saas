import { DatabaseService } from "../database/database.service.js";
import { hashSensitiveIdentity, WecomSensitiveStateRepository } from "./wecom-sensitive-state.repository.js";

describe("WecomSensitiveStateRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => delete process.env.DATABASE_URL);
  afterAll(() => {
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("consumes a valid state exactly once", async () => {
    const repository = new WecomSensitiveStateRepository(new DatabaseService());
    const context = {
      tenantId: "tenant-1",
      memberIdentityId: "member-1",
      openCorpid: "corp-1",
      openUseridHash: hashSensitiveIdentity("open-user-1")
    };
    await repository.create("state-token", context, new Date(Date.now() + 60_000));

    await expect(repository.consume("state-token")).resolves.toEqual(context);
    await expect(repository.consume("state-token")).resolves.toBeNull();
  });
});
