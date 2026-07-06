import { DatabaseService } from "../database/database.service.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
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

  it("updates member, primary card, and public directory status in tenant scope", async () => {
    const tenantTx = new FakeTenantTx();
    const repository = new AdminManagementRepository(tenantTx as unknown as TenantTx);

    await expect(
      repository.updateMemberStatus(
        {
          tenantId: "tenant-001",
          tenantName: "Pilot Corp",
          memberIdentityId: "member-001",
          openUserid: "ou-owner",
          role: "owner"
        },
        "member-001",
        "disabled"
      )
    ).resolves.toBe(true);

    expect(tenantTx.tenantId).toBe("tenant-001");
    expect(tenantTx.transaction.memberStatusParams).toEqual(["tenant-001", "member-001", "disabled"]);
    expect(tenantTx.transaction.cardStatusParams).toEqual(["tenant-001", "member-001", "disabled"]);
    expect(tenantTx.transaction.directoryStatusParams).toEqual(["pub_001", "tenant-001", "card-001", "disabled"]);
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

class FakeTenantTx {
  tenantId = "";
  transaction = new FakeTransaction();

  async run<T>(tenantId: string, callback: (tx: TenantTransactionClient) => Promise<T>): Promise<T> {
    this.tenantId = tenantId;
    return callback(this.transaction as unknown as TenantTransactionClient);
  }
}

class FakeTransaction {
  memberStatusParams: unknown[] | undefined;
  cardStatusParams: unknown[] | undefined;
  directoryStatusParams: unknown[] | undefined;

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    if (text.includes("UPDATE member_identities")) {
      this.memberStatusParams = values;
      return { rows: [{ id: "member-001" } as T] };
    }
    if (text.includes("UPDATE cards")) {
      this.cardStatusParams = values;
      return { rows: [{ id: "card-001", public_id: "pub_001" } as T] };
    }
    if (text.includes("INSERT INTO public_card_directory")) {
      this.directoryStatusParams = values;
      return { rows: [] };
    }
    return { rows: [] };
  }
}
