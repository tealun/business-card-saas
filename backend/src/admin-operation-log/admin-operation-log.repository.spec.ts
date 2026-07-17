import type { DatabaseService } from "../database/database.service.js";
import { AdminOperationLogRepository, type AdminOperationLogInsert } from "./admin-operation-log.repository.js";

describe("AdminOperationLogRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://localhost/business-card-test";
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("inserts a log row with parameterized values", async () => {
    const database = fakeDatabase();
    const repository = new AdminOperationLogRepository(database as unknown as DatabaseService);
    const entry: AdminOperationLogInsert = {
      tenantId: "1",
      actorAdminId: "10",
      actorOpenUserid: "ou-owner",
      actorName: null,
      actorRole: "owner",
      accountType: "tenant",
      action: "member.sync",
      targetType: null,
      targetId: null,
      detail: { synced_count: 2 },
      ip: "203.0.113.10"
    };

    await repository.insert(entry);

    expect(database.query).toHaveBeenCalledTimes(1);
    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("INSERT INTO admin_operation_logs");
    expect(values).toEqual([
      "1",
      "10",
      "ou-owner",
      null,
      "owner",
      "tenant",
      "member.sync",
      null,
      null,
      JSON.stringify({ synced_count: 2 }),
      "203.0.113.10"
    ]);
  });

  it("lists only the current tenant's logs with pagination", async () => {
    const database = fakeDatabase([logRow()]);
    const repository = new AdminOperationLogRepository(database as unknown as DatabaseService);

    const result = await repository.listTenantLogs("7", { action: "", search: "", limit: 50, offset: 0 });

    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("l.tenant_id = $1");
    expect(values).toEqual(["7", 50, 0]);
    expect(result.total).toBe(1);
    expect(result.items[0]).toEqual({
      log_id: "42",
      actor_name: "Admin Two",
      actor_open_userid: "ou-admin",
      actor_role: "admin",
      action: "member.card.update",
      target_type: "member_identity",
      target_id: "10",
      detail: { status: "disabled" },
      ip: "203.0.113.10",
      created_at: "2026-07-16T12:00:00.000Z"
    });
  });

  it("lists platform logs across tenants with tenant names, filters and pagination", async () => {
    const database = fakeDatabase([logRow()]);
    const repository = new AdminOperationLogRepository(database as unknown as DatabaseService);

    const result = await repository.listPlatformLogs({
      action: "member.sync",
      search: "pilot",
      tenant_id: "9",
      limit: 10,
      offset: 20
    });

    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("LEFT JOIN tenants");
    expect(sql).toContain("l.action = $2");
    expect(values).toEqual(["9", "member.sync", "%pilot%", 10, 20]);
    expect(result.items[0]).toMatchObject({ tenant_id: "7", tenant_name: "Pilot Corp" });
  });

  it("applies no tenant filter for unscoped platform queries", async () => {
    const database = fakeDatabase([]);
    const repository = new AdminOperationLogRepository(database as unknown as DatabaseService);

    const result = await repository.listPlatformLogs({ action: "", search: "", limit: 50, offset: 0 });

    const [sql, values] = database.query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("l.tenant_id = $1");
    expect(values).toEqual([50, 0]);
    expect(result).toEqual({ items: [], total: 0 });
  });

  it("skips persistence when the database is not configured", async () => {
    delete process.env.DATABASE_URL;
    const database = fakeDatabase();
    const repository = new AdminOperationLogRepository(database as unknown as DatabaseService);

    await repository.insert({
      tenantId: "1",
      actorAdminId: null,
      actorOpenUserid: null,
      actorName: null,
      actorRole: "owner",
      accountType: "tenant",
      action: "member.sync",
      targetType: null,
      targetId: null,
      detail: null,
      ip: null
    });
    await expect(repository.listTenantLogs("1", { action: "", search: "", limit: 50, offset: 0 })).resolves.toEqual({
      items: [],
      total: 0
    });
    expect(database.query).not.toHaveBeenCalled();
  });
});

function fakeDatabase(rows: Record<string, unknown>[] = []) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

function logRow() {
  return {
    log_id: "42",
    tenant_id: "7",
    tenant_name: "Pilot Corp",
    actor_name: "Admin Two",
    actor_open_userid: "ou-admin",
    actor_role: "admin",
    action: "member.card.update",
    target_type: "member_identity",
    target_id: "10",
    detail_json: { status: "disabled" },
    ip: "203.0.113.10",
    created_at: "2026-07-16T12:00:00.000Z",
    total_count: "1"
  };
}
