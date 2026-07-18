import { AdminWecomScanRepository } from "./admin-wecom-scan.repository.js";

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
});
