import { EmployeeCardRepository } from "./employee-card.repository.js";

describe("EmployeeCardRepository", () => {
  it("aligns card status with the current employee session", async () => {
    const repository = new EmployeeCardRepository();

    const card = await repository.getCurrentCard({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001",
      status: "disabled"
    });
    const preview = await repository.getPreview({
      accountId: "acct-001",
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      memberIdentityId: "member-001",
      displayName: "Ada",
      openUserid: "ou-001",
      publicId: "pub_001",
      status: "disabled"
    });

    expect(card.status).toBe("disabled");
    expect(preview.status).toBe("disabled");
  });

  it("returns zero stats without a database", async () => {
    const repository = new EmployeeCardRepository();
    await expect(
      repository.getCurrentCardStats({
        accountId: "acct-001",
        tenantId: "tenant-001",
        memberIdentityId: "member-001",
        openUserid: "ou-001"
      })
    ).resolves.toEqual({ visitor_count: 0, visit_count: 0, recent_visitors: [] });
  });

  it("aggregates per-identity visit stats through the tenant transaction", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test";
    const queries: Array<{ text: string; values: unknown[] }> = [];
    const lastVisit = new Date("2026-07-11T08:00:00.000Z");
    const fakeTx = {
      query: async (text: string, values: unknown[] = []) => {
        queries.push({ text, values });
        if (text.includes("GROUP BY")) {
          return {
            rows: [
              { visitor_key: "anon-1", has_account: false, visit_count: "3", channel: "share", last_visit_at: lastVisit }
            ]
          };
        }
        return { rows: [{ visit_count: "5", visitor_count: "2" }] };
      }
    };
    const tenantTx = {
      run: async (tenantId: string, callback: (tx: typeof fakeTx) => Promise<unknown>) => {
        expect(tenantId).toBe("tenant-001");
        return callback(fakeTx);
      }
    };
    try {
      const repository = new EmployeeCardRepository(tenantTx as never);
      const stats = await repository.getCurrentCardStats({
        accountId: "acct-001",
        tenantId: "tenant-001",
        memberIdentityId: "member-001",
        openUserid: "ou-001"
      });
      expect(stats).toEqual({
        visitor_count: 2,
        visit_count: 5,
        recent_visitors: [
          {
            visitor_key: "anon-1",
            visitor_label: "匿名访客",
            visit_count: 3,
            channel: "share",
            last_visit_at: lastVisit.toISOString()
          }
        ]
      });
      expect(queries.every((query) => query.values.join(",").includes("member-001"))).toBe(true);
    } finally {
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      } else {
        delete process.env.DATABASE_URL;
      }
    }
  });
});
