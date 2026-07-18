import { ConflictException } from "@nestjs/common";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type { AppConfig } from "../config/app-config.js";
import type { DatabaseService } from "../database/database.service.js";
import { AdminDatabaseService } from "./admin-database.service.js";

const ownerSession: AdminSession = {
  tenantId: "tenant-001",
  tenantName: "Pilot Corp",
  memberIdentityId: "member-001",
  openUserid: "ou-owner",
  role: "owner",
  accountType: "platform"
};

const adminSession: AdminSession = {
  ...ownerSession,
  // Admin-level platform operator per the 01_08 M1 mapping (legacy transition-era
  // 'admin' is no longer a valid platform role; ops sits at the same rank).
  role: "ops"
};

const tenantOwnerSession: AdminSession = {
  ...ownerSession,
  openUserid: "ou-tenant-owner",
  accountType: "tenant"
};

describe("AdminDatabaseService", () => {
  let tempRoot: string;

  afterEach(async () => {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  async function createDatabaseDir() {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bc-db-ops-"));
    await fs.mkdir(path.join(tempRoot, "migrations"));
    await fs.writeFile(
      path.join(tempRoot, "package.json"),
      JSON.stringify({
        name: "business-card-database",
        scripts: {
          migrate: "node scripts/migrate.cjs"
        }
      })
    );
    await fs.writeFile(path.join(tempRoot, "migrations", "migrate_v1_1.sql"), "SELECT 1;\n");
    await fs.writeFile(path.join(tempRoot, "migrations", "migrate_v1_2.sql"), "SELECT 1;\n");
    return tempRoot;
  }

  function createService(options: {
    databaseDir?: string;
    applied?: string[];
    tableExists?: boolean;
    queryError?: Error;
  }) {
    const config = {
      databaseDir: options.databaseDir ?? ""
    } as AppConfig;
    const database = {
      query: jest.fn(async (sql: string) => {
        if (options.queryError) {
          throw options.queryError;
        }
        if (sql.includes("to_regclass")) {
          return { rows: [{ table_name: options.tableExists === false ? null : "pgmigrations" }] };
        }
        return { rows: (options.applied ?? []).map((name) => ({ name, run_on: new Date("2026-07-16T01:00:00.000Z") })) };
      })
    } as unknown as DatabaseService;
    return { service: new AdminDatabaseService(config, database), database };
  }

  it("reports an unconfigured database directory", async () => {
    const { service } = createService({});
    await expect(service.getMigrationStatus(adminSession)).resolves.toMatchObject({
      configured: false,
      pending_count: 0,
      errors: ["DATABASE_DIR is not configured"]
    });
  });

  it("detects pending migration files from database/migrations", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({
      databaseDir,
      applied: ["migrate_v1_1"]
    });

    await expect(service.getMigrationStatus(adminSession)).resolves.toMatchObject({
      configured: true,
      migration_files: ["migrate_v1_1.sql", "migrate_v1_2.sql"],
      applied_migrations: ["migrate_v1_1"],
      pending_count: 1,
      pending_migrations: [
        {
          name: "migrate_v1_2",
          file_name: "migrate_v1_2.sql",
          applied: false
        }
      ],
      errors: []
    });
  });

  it("orders migration files numerically, not lexicographically", async () => {
    const databaseDir = await createDatabaseDir();
    await fs.writeFile(path.join(databaseDir, "migrations", "migrate_v1_10.sql"), "SELECT 1;\n");

    const { service } = createService({ databaseDir, applied: [] });
    await expect(service.getMigrationStatus(adminSession)).resolves.toMatchObject({
      migration_files: ["migrate_v1_1.sql", "migrate_v1_2.sql", "migrate_v1_10.sql"]
    });
  });

  it("does not run migrations when nothing is pending", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({
      databaseDir,
      applied: ["migrate_v1_1.sql", "migrate_v1_2.sql"]
    });

    await expect(service.runPendingMigrations(ownerSession)).resolves.toMatchObject({
      ran: false,
      stdout: "",
      stderr: "",
      before: {
        pending_count: 0
      },
      after: {
        pending_count: 0
      }
    });
  });

  it("allows only owner to execute migrations", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({ databaseDir, applied: [] });
    await expect(service.runPendingMigrations(adminSession)).rejects.toThrow("admin role does not have permission");
  });

  it("rejects tenant owners from migration status and execution", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({ databaseDir, applied: [] });
    await expect(service.getMigrationStatus(tenantOwnerSession)).rejects.toThrow("platform administrator required");
    await expect(service.runPendingMigrations(tenantOwnerSession)).rejects.toThrow("platform administrator required");
  });

  it("blocks execution when migration status has errors", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({
      databaseDir,
      queryError: new Error("connect ECONNREFUSED")
    });
    await expect(service.runPendingMigrations(ownerSession)).rejects.toThrow(ConflictException);
  });
});
