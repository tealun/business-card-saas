import type { AdminSession } from "../admin-auth/admin-session.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import { AdminObservabilityRepository } from "./admin-observability.repository.js";

describe("AdminObservabilityRepository", () => {
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

  const session: AdminSession = {
    tenantId: "tenant-001",
    tenantName: "Pilot Corp",
    memberIdentityId: "member-001",
    openUserid: "ou-owner",
    role: "owner"
  };

  // A71-P1-4: the service pre-checks self-modify and owner-row before calling this method, but
  // that is a check-then-act gap under concurrent requests (A71-P1-6). The UPDATE's WHERE clause
  // must re-assert both conditions atomically -- this test guards the SQL, not the service.
  it("scopes the status UPDATE by tenant_id and re-asserts self/owner-row protection in SQL", async () => {
    const transaction = new FakeUpdateTransaction();
    const tenantTx = new FakeTenantTx(transaction);
    const repository = new AdminObservabilityRepository(tenantTx as unknown as TenantTx);

    await repository.updateTenantAdminStatus(session, "target-admin-002", "disabled");

    expect(tenantTx.tenantId).toBe("tenant-001");
    expect(transaction.updateQuery).toBeDefined();
    expect(transaction.updateQuery?.text).toContain("WHERE tenant_id = $1 AND id = $2");
    expect(transaction.updateQuery?.text).toContain("AND role <> 'owner'");
    expect(transaction.updateQuery?.text).toContain("AND open_userid IS DISTINCT FROM $4");
    expect(transaction.updateQuery?.text).toContain("AND member_identity_id::text IS DISTINCT FROM $5");
    expect(transaction.updateQuery?.values).toEqual([
      "tenant-001",
      "target-admin-002",
      "disabled",
      "ou-owner",
      "member-001"
    ]);
  });

  it("cannot target another tenant's admin row: tenant_id is always taken from the session, never the caller-supplied id", async () => {
    const transaction = new FakeUpdateTransaction();
    const tenantTx = new FakeTenantTx(transaction);
    const repository = new AdminObservabilityRepository(tenantTx as unknown as TenantTx);

    await repository.updateTenantAdminStatus(session, "admin-in-another-tenant", "disabled");

    // The only tenant_id ever bound into the query is the session's own -- there is no code path
    // by which a cross-tenant adminId could widen the scope of the WHERE clause.
    expect(tenantTx.tenantId).toBe(session.tenantId);
    expect(transaction.updateQuery?.values[0]).toBe(session.tenantId);
  });

  it("returns null when the UPDATE matches no row (wrong tenant, self, or owner row)", async () => {
    const transaction = new FakeUpdateTransaction({ matches: false });
    const tenantTx = new FakeTenantTx(transaction);
    const repository = new AdminObservabilityRepository(tenantTx as unknown as TenantTx);

    await expect(repository.updateTenantAdminStatus(session, "target-admin-002", "disabled")).resolves.toBeNull();
  });
});

class FakeTenantTx {
  tenantId = "";
  constructor(private readonly transaction: FakeUpdateTransaction) {}

  async run<T>(tenantId: string, callback: (tx: TenantTransactionClient) => Promise<T>): Promise<T> {
    this.tenantId = tenantId;
    return callback(this.transaction as unknown as TenantTransactionClient);
  }
}

class FakeUpdateTransaction {
  updateQuery: { text: string; values: unknown[] } | undefined;
  private readonly matches: boolean;

  constructor(options: { matches?: boolean } = {}) {
    this.matches = options.matches ?? true;
  }

  async query<T>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
    if (text.includes("UPDATE tenant_admins")) {
      this.updateQuery = { text, values };
      return { rows: this.matches ? [{ id: values[1] } as T] : [] };
    }
    if (text.includes("SELECT")) {
      return {
        rows: this.matches
          ? [
              {
                admin_id: values[1],
                member_identity_id: "20",
                display_name: "Admin Two",
                open_userid: "ou-admin",
                userid: "admin-two",
                role: "admin",
                status: "active",
                created_at: "2026-07-01T00:00:00.000Z",
                updated_at: "2026-07-01T00:00:00.000Z"
              } as T
            ]
          : []
      };
    }
    return { rows: [] };
  }
}
