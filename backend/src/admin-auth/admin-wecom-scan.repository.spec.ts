import { AdminWecomScanRepository } from "./admin-wecom-scan.repository.js";
import type { TenantTx, TenantTransactionClient } from "../database/tenant-tx.service.js";

describe("AdminWecomScanRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("creates the first scanned WeCom admin as owner and later admins as admin without database", async () => {
    const repository = new AdminWecomScanRepository();

    await expect(
      repository.upsertFromScan({
        tenantId: "tenant-1",
        tenantName: "Pilot Corp",
        userid: "zhangsan",
        openUserid: "open-zhangsan"
      })
    ).resolves.toMatchObject({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp",
      openUserid: "open-zhangsan",
      role: "owner",
      status: "active"
    });

    await expect(
      repository.upsertFromScan({
        tenantId: "tenant-1",
        tenantName: "Pilot Corp",
        userid: "lisi",
        openUserid: "open-lisi"
      })
    ).resolves.toMatchObject({
      tenantId: "tenant-1",
      openUserid: "open-lisi",
      role: "admin",
      status: "active"
    });
  });

  it("keeps an existing scanned admin role stable", async () => {
    const repository = new AdminWecomScanRepository();

    const first = await repository.upsertFromScan({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp",
      userid: "zhangsan",
      openUserid: "open-zhangsan"
    });
    const second = await repository.upsertFromScan({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp Renamed",
      userid: "zhangsan",
      openUserid: "open-zhangsan"
    });

    expect(second).toEqual(first);
  });

  it("creates a default card and public directory entry when scan-login provisions an admin with database", async () => {
    process.env.DATABASE_URL = "postgres://localhost/business-card-test";
    const transaction = new FakeScanTransaction();
    const repository = new AdminWecomScanRepository(new FakeTenantTx(transaction) as unknown as TenantTx);

    const admin = await repository.upsertFromScan({
      tenantId: "tenant-1",
      tenantName: "Pilot Corp",
      userid: "zhangsan",
      openUserid: "open-zhangsan"
    });

    expect(admin).toMatchObject({
      tenantId: "tenant-1",
      memberIdentityId: "member-1",
      openUserid: "open-zhangsan",
      role: "owner",
      status: "active"
    });
    expect(transaction.cardInsertValues).toEqual([
      "tenant-1",
      "member-1",
      expect.stringMatching(/^pub_/),
      expect.stringMatching(/^card-/),
      "zhangsan",
      JSON.stringify({ show_mobile: false, show_email: true, show_wechat: false, allow_forward: true })
    ]);
    expect(transaction.directoryValues).toEqual(["pub_admin_1", "tenant-1", "card-1"]);
  });
});

class FakeTenantTx {
  constructor(private readonly transaction: FakeScanTransaction) {}

  async run<T>(tenantId: string, callback: (tx: TenantTransactionClient) => Promise<T>): Promise<T> {
    this.transaction.tenantId = tenantId;
    return callback(this.transaction as unknown as TenantTransactionClient);
  }
}

class FakeScanTransaction {
  tenantId = "";
  cardInsertValues: unknown[] | undefined;
  directoryValues: unknown[] | undefined;

  async query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }> {
    if (text.includes("INSERT INTO member_identities")) {
      return { rows: [{ id: "member-1", name: "zhangsan" } as T] };
    }
    if (text.includes("FROM tenant_admins a")) {
      return { rows: [] };
    }
    if (text.includes("FROM cards")) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO cards")) {
      this.cardInsertValues = values;
      return { rows: [{ id: "card-1", public_id: "pub_admin_1" } as T] };
    }
    if (text.includes("INSERT INTO public_card_directory")) {
      this.directoryValues = values;
      return { rows: [] };
    }
    if (text.includes("FROM tenant_admins") && text.includes("role = 'owner'")) {
      return { rows: [] };
    }
    if (text.includes("INSERT INTO tenant_admins")) {
      return {
        rows: [
          {
            tenant_id: values?.[0],
            member_identity_id: values?.[1],
            open_userid: values?.[2],
            role: values?.[3] ?? "owner",
            tenant_name: values?.[4] ?? "Pilot Corp",
            status: "active"
          } as T
        ]
      };
    }
    return { rows: [] };
  }
}
