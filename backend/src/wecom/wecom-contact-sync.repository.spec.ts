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

  it("does not replace existing account-like names when WeCom detail has no real name", async () => {
    const tenantTx = new FakeTenantTx();
    tenantTx.transaction.memberName = "user-001";
    const repository = new WecomContactSyncRepository(tenantTx as unknown as TenantTx);

    await repository.upsertMembers({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      users: [
        {
          userid: "user-001",
          openUserid: "ou-001",
          name: "user-001",
          departmentIds: ["1"],
          status: "active"
        }
      ]
    });

    expect(tenantTx.transaction.memberUpdateParams?.[3]).toBeNull();
    expect(tenantTx.transaction.cardUpdateParams).toEqual([
      "tenant-001",
      "12",
      "active",
      "user-001",
      "ou-001",
      "WeCom Member",
      "user-001",
      null,
      null,
      null,
      null,
      "未填写姓名"
    ]);
  });

  it("matches existing members across identifier columns", async () => {
    const tenantTx = new FakeTenantTx();
    const repository = new WecomContactSyncRepository(tenantTx as unknown as TenantTx);

    await repository.upsertMembers({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      users: [
        {
          userid: "tealun",
          openUserid: null,
          name: null,
          departmentIds: [],
          status: "active"
        }
      ]
    });

    // 登录/兜底可能把同一标识写进 open_userid 列，同步必须跨列匹配才能合并同一成员。
    expect(tenantTx.transaction.memberSelectSql).toContain("open_userid = $2 OR userid = $2");
    expect(tenantTx.transaction.memberSelectSql).toContain("userid = $3 OR open_userid = $3");
  });

  it("disables a member only when none of its identifiers appear in the active list", async () => {
    const tenantTx = new FakeTenantTx();
    const repository = new WecomContactSyncRepository(tenantTx as unknown as TenantTx);

    await repository.disableStaleMembers({
      tenantId: "tenant-001",
      activeOpenUserids: ["ou-001"],
      activeUserids: ["tealun", "ou-001"]
    });

    expect(tenantTx.transaction.staleSql).toContain("open_userid IS NULL OR NOT (open_userid = ANY($2::text[]))");
    expect(tenantTx.transaction.staleSql).toContain("userid IS NULL OR NOT (userid = ANY($2::text[]))");
    // 两列共用一份合并去重后的在职标识集合。
    expect(tenantTx.transaction.staleParams).toEqual(["tenant-001", ["ou-001", "tealun"]]);
  });

  it("replaces old unknown display-name placeholders with the account id fallback", async () => {
    const tenantTx = new FakeTenantTx();
    tenantTx.transaction.memberName = "未填写姓名";
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

    expect(tenantTx.transaction.memberUpdateParams?.[3]).toBe("user-001");
    expect(tenantTx.transaction.cardUpdateParams?.[6]).toBe("user-001");
  });
});

class FakeTenantTx {
  transaction = new FakeTransaction();

  async run<T>(_tenantId: string, callback: (tx: TenantTransactionClient) => Promise<T>): Promise<T> {
    return callback(this.transaction as unknown as TenantTransactionClient);
  }
}

class FakeTransaction {
  memberName = "Ada Existing";
  memberSelectSql = "";
  memberUpdateSql = "";
  memberUpdateParams: unknown[] | null = null;
  cardUpdateParams: unknown[] | null = null;
  staleSql = "";
  staleParams: unknown[] | null = null;

  async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    if (text.includes("WITH stale AS")) {
      this.staleSql = text;
      this.staleParams = params;
      return { rows: [] };
    }
    if (text.includes("SELECT id, name") && text.includes("FROM member_identities")) {
      this.memberSelectSql = text;
      return { rows: [{ id: "7", name: this.memberName } as T] };
    }
    if (text.includes("SELECT id") && text.includes("FROM member_identities")) {
      return { rows: [] };
    }
    if (text.includes("UPDATE member_identities")) {
      this.memberUpdateSql = text;
      this.memberUpdateParams = params;
      return { rows: [{ id: "7", name: String(params[3] ?? this.memberName) } as T] };
    }
    if (text.includes("SELECT id, public_id") && text.includes("FROM cards")) {
      return { rows: [{ id: "12", public_id: "pub_existing0001" } as T] };
    }
    if (text.includes("UPDATE cards")) {
      this.cardUpdateParams = params;
      return { rows: [] };
    }
    return { rows: [] };
  }
}
