import type { QueryResult, QueryResultRow } from "pg";
import type { DatabaseTransaction } from "../database/database.service.js";
import type { TenantTx } from "../database/tenant-tx.service.js";
import { OwnerBootstrapRepository } from "./owner-bootstrap.repository.js";

describe("OwnerBootstrapRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgres://unit-test";
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("creates the first owner inside the tenant transaction in database mode", async () => {
    const tx = new FakeTenantTx([
      [],
      [
        {
          tenant_id: "7",
          member_identity_id: "70",
          open_userid: "ou-owner",
          role: "owner"
        }
      ]
    ]);
    const repository = new OwnerBootstrapRepository(tx as unknown as TenantTx);

    const owner = await repository.createOwner({
      tenantId: "7",
      memberIdentityId: "70",
      openUserid: "ou-owner"
    });

    expect(owner).toEqual({
      tenantId: "7",
      memberIdentityId: "70",
      openUserid: "ou-owner",
      role: "owner"
    });
    expect(tx.tenantIds).toEqual(["7"]);
    expect(tx.queries.some((query) => query.text.includes("INSERT INTO tenant_admins"))).toBe(true);
  });

  it("consumes a valid claim token before inserting the owner in database mode", async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const tx = new FakeTenantTx([
      [
        {
          tenant_id: "8",
          token_hash: "hash-8",
          expires_at: expiresAt,
          used_at: null
        }
      ],
      [],
      [
        {
          tenant_id: "8",
          token_hash: "hash-8",
          expires_at: expiresAt,
          used_at: new Date()
        }
      ],
      [
        {
          tenant_id: "8",
          member_identity_id: "80",
          open_userid: "ou-claimed",
          role: "owner"
        }
      ]
    ]);
    const repository = new OwnerBootstrapRepository(tx as unknown as TenantTx);

    const owner = await repository.claimOwner({
      tenantId: "8",
      tokenHash: "hash-8",
      memberIdentityId: "80",
      openUserid: "ou-claimed"
    });

    expect(owner).toEqual({
      tenantId: "8",
      memberIdentityId: "80",
      openUserid: "ou-claimed",
      role: "owner"
    });
    const updateIndex = tx.queries.findIndex((query) => query.text.includes("UPDATE admin_claim_tokens"));
    const insertIndex = tx.queries.findIndex((query) => query.text.includes("INSERT INTO tenant_admins"));
    expect(updateIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(updateIndex);
  });
});

interface CapturedQuery {
  text: string;
  values?: unknown[];
}

class FakeTenantTx {
  readonly tenantIds: string[] = [];
  readonly queries: CapturedQuery[] = [];

  constructor(private readonly queuedRows: QueryResultRow[][]) {}

  async run<T>(tenantId: bigint | number | string, callback: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    this.tenantIds.push(String(tenantId));
    return callback({
      query: async <R extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<R>> => {
        const captured: CapturedQuery = { text };
        if (values) {
          captured.values = values;
        }
        this.queries.push(captured);
        const rows = (this.queuedRows.shift() ?? []) as R[];
        return { rows } as QueryResult<R>;
      }
    });
  }
}
