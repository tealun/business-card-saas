import { DatabaseService } from "../database/database.service.js";
import { WecomEmployeeProvisioningRepository } from "./wecom-employee-provisioning.repository.js";

describe("WecomEmployeeProvisioningRepository", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("provisions and reuses the same member identity for repeated WeCom logins", async () => {
    const repository = new WecomEmployeeProvisioningRepository(new DatabaseService());

    const first = await repository.provision({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      openUserid: "ou-001"
    });
    const second = await repository.provision({
      tenantId: "tenant-001",
      tenantName: "Pilot Corp",
      openUserid: "ou-001"
    });

    expect(second).toEqual(first);
    expect(first.publicId).toMatch(/^pub_[A-Za-z0-9_-]{24}$/);
  });
});
