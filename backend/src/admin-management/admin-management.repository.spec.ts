import { DatabaseService } from "../database/database.service.js";
import { AdminManagementRepository } from "./admin-management.repository.js";

describe("AdminManagementRepository", () => {
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

  it("lists only current-tenant sync events without exposing encrypted payloads", async () => {
    const database = new FakeDatabaseService();
    const repository = new AdminManagementRepository(undefined, database as unknown as DatabaseService);

    const result = await repository.listSyncEvents({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      openUserid: "ou-owner",
      role: "owner"
    });

    expect(database.lastValues).toEqual(["tenant-001"]);
    expect(database.lastQuery).toContain("WHERE tenant_id = $1");
    expect(result?.items[0]).toEqual({
      id: "42",
      source: "data",
      event_key: "wecom:data:event-001",
      event_type: "change_contact",
      change_type: "update_user",
      status: "done",
      retry_count: 1,
      received_at: "2026-07-06T12:00:00.000Z",
      processed_at: "2026-07-06T12:00:01.000Z",
      last_error: null
    });
  });
});

class FakeDatabaseService {
  lastQuery = "";
  lastValues: unknown[] | undefined;

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    this.lastQuery = text;
    this.lastValues = values;
    return {
      rows: [
        {
          id: "42",
          source: "data",
          event_key: "wecom:data:event-001",
          event_type: "change_contact",
          change_type: "update_user",
          status: "done",
          retry_count: 1,
          received_at: new Date("2026-07-06T12:00:00.000Z"),
          processed_at: new Date("2026-07-06T12:00:01.000Z"),
          last_error: null,
          payload_encrypted: "cipher",
          total_count: "1"
        } as T
      ]
    };
  }
}
