import { TenantTx } from "./tenant-tx.service.js";

interface MockTx {
  $executeRaw: jest.Mock<Promise<number>, unknown[]>;
  card: {
    findMany: jest.Mock<Promise<string[]>, unknown[]>;
  };
}

interface MockPrisma {
  $transaction: jest.Mock<Promise<unknown>, [(tx: MockTx) => Promise<unknown>]>;
}

describe("TenantTx", () => {
  it("sets tenant context before running the transactional callback", async () => {
    const calls: string[] = [];
    const tx: MockTx = {
      $executeRaw: jest.fn(async () => {
        calls.push("set_tenant");
        return 1;
      }),
      card: {
        findMany: jest.fn(async () => {
          calls.push("query_cards");
          return ["tenant-card"];
        })
      }
    };
    const prisma: MockPrisma = {
      $transaction: jest.fn(async (callback) => callback(tx))
    };

    const tenantTx = new TenantTx(prisma as never);
    const result = await tenantTx.run("42", async (scopedTx) => {
      const scoped = scopedTx as unknown as MockTx;
      return scoped.card.findMany();
    });

    expect(result).toEqual(["tenant-card"]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0]?.[1]).toBe("42");
    expect(calls).toEqual(["set_tenant", "query_cards"]);
  });

  it("sets account context before running account-scoped work", async () => {
    const calls: string[] = [];
    const tx: MockTx = {
      $executeRaw: jest.fn(async () => {
        calls.push("set_account");
        return 1;
      }),
      card: {
        findMany: jest.fn(async () => {
          calls.push("query_account_scope");
          return ["account-binding"];
        })
      }
    };
    const prisma: MockPrisma = {
      $transaction: jest.fn(async (callback) => callback(tx))
    };

    const tenantTx = new TenantTx(prisma as never);
    const result = await tenantTx.runForAccount(7, async (scopedTx) => {
      const scoped = scopedTx as unknown as MockTx;
      return scoped.card.findMany();
    });

    expect(result).toEqual(["account-binding"]);
    expect(tx.$executeRaw.mock.calls[0]?.[1]).toBe("7");
    expect(calls).toEqual(["set_account", "query_account_scope"]);
  });
});
