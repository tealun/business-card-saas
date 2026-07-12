import { DatabaseSchemaGuard } from "./database-schema-guard.service.js";
import type { DatabaseService } from "./database.service.js";

describe("DatabaseSchemaGuard", () => {
  it("adds the employee card avatar column when a database is configured", async () => {
    const database = {
      isConfigured: jest.fn(() => true),
      query: jest.fn(async () => ({ rows: [] }))
    } as unknown as DatabaseService;

    await new DatabaseSchemaGuard(database).onModuleInit();

    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('ADD COLUMN IF NOT EXISTS "avatar_url" TEXT'));
    expect(database.query).toHaveBeenCalledWith(expect.stringContaining('ALTER COLUMN "anon_id" TYPE VARCHAR(128)'));
  });

  it("skips schema checks when no database is configured", async () => {
    const database = {
      isConfigured: jest.fn(() => false),
      query: jest.fn()
    } as unknown as DatabaseService;

    await new DatabaseSchemaGuard(database).onModuleInit();

    expect(database.query).not.toHaveBeenCalled();
  });
});
