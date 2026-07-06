import { TenantTx } from "./tenant-tx.service.js";
import type { DatabaseTransaction } from "./database.service.js";

interface MockDatabase {
  transaction: jest.Mock<Promise<unknown>, [(tx: DatabaseTransaction) => Promise<unknown>]>;
}

describe("TenantTx", () => {
  it("sets tenant context before running the transactional callback", async () => {
    const calls: string[] = [];
    const tx: DatabaseTransaction = {
      query: jest.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("app.tenant_id")) {
          calls.push(`set_tenant:${values?.[0]}`);
          return { rows: [], rowCount: 0 } as never;
        }
        calls.push("query_cards");
        return { rows: [{ id: "tenant-card" }], rowCount: 1 } as never;
      })
    };
    const database: MockDatabase = {
      transaction: jest.fn(async (callback) => callback(tx))
    };

    const tenantTx = new TenantTx(database as never);
    const result = await tenantTx.run("42", async (scopedTx) => scopedTx.query("SELECT id FROM cards"));

    expect(result.rows).toEqual([{ id: "tenant-card" }]);
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(tx.query).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["set_tenant:42", "query_cards"]);
  });

  it("sets account context before running account-scoped work", async () => {
    const calls: string[] = [];
    const tx: DatabaseTransaction = {
      query: jest.fn(async (sql: string, values?: unknown[]) => {
        if (sql.includes("app.account_id")) {
          calls.push(`set_account:${values?.[0]}`);
          return { rows: [], rowCount: 0 } as never;
        }
        calls.push("query_account_scope");
        return { rows: [{ id: "account-binding" }], rowCount: 1 } as never;
      })
    };
    const database: MockDatabase = {
      transaction: jest.fn(async (callback) => callback(tx))
    };

    const tenantTx = new TenantTx(database as never);
    const result = await tenantTx.runForAccount(7, async (scopedTx) =>
      scopedTx.query("SELECT id FROM account_identity_bindings")
    );

    expect(result.rows).toEqual([{ id: "account-binding" }]);
    expect(tx.query).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["set_account:7", "query_account_scope"]);
  });
});
