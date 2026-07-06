import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import { WecomContactSyncRepository } from "./wecom-contact-sync.repository.js";

describe("WecomContactSyncRepository", () => {
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

  it("preserves the existing display name when an incremental update omits name", async () => {
    const tenantTx = new FakeTenantTx();
    const repository = new WecomContactSyncRepository(tenantTx as unknown as TenantTx);

    await repository.upsertMembers({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      users: [
        {
          userid: "user-001",
          openUserid: "ou-001",
          name: null,
          departmentIds: ["1"],
          status: "active"
        }
      ]
    });

    expect(tenantTx.transaction.memberUpdateSql).toContain("name = COALESCE($4, name)");
    expect(tenantTx.transaction.memberUpdateParams?.[3]).toBeNull();
  });
});

class FakeTenantTx {
  transaction = new FakeTransaction();

  async run<T>(_tenantId: string, callback: (tx: TenantTransactionClient) => Promise<T>): Promise<T> {
    return callback(this.transaction as unknown as TenantTransactionClient);
  }
}

class FakeTransaction {
  memberUpdateSql = "";
  memberUpdateParams: unknown[] | null = null;

  async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    if (text.includes("SELECT id, name") && text.includes("FROM member_identities")) {
      return { rows: [{ id: "7", name: "Ada Existing" } as T] };
    }
    if (text.includes("SELECT id") && text.includes("FROM member_identities")) {
      return { rows: [] };
    }
    if (text.includes("UPDATE member_identities")) {
      this.memberUpdateSql = text;
      this.memberUpdateParams = params;
      return { rows: [{ id: "7", name: "Ada Existing" } as T] };
    }
    if (text.includes("SELECT id, public_id") && text.includes("FROM cards")) {
      return { rows: [{ id: "12", public_id: "pub_existing0001" } as T] };
    }
    return { rows: [] };
  }
}
