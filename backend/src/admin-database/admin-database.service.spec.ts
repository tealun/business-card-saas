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
  role: "owner"
};

const adminSession: AdminSession = {
  ...ownerSession,
  role: "admin"
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
          migrate: "node-pg-migrate up --migrations-dir migrations"
        }
      })
    );
    await fs.writeFile(path.join(tempRoot, "migrations", "0000000000000_baseline.js"), "exports.up = () => {};\n");
    await fs.writeFile(path.join(tempRoot, "migrations", "1783520000000_personal_identities.js"), "exports.up = () => {};\n");
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
        return { rows: (options.applied ?? []).map((name) => ({ name })) };
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
      applied: ["0000000000000_baseline"]
    });

    await expect(service.getMigrationStatus(adminSession)).resolves.toMatchObject({
      configured: true,
      migration_files: ["0000000000000_baseline.js", "1783520000000_personal_identities.js"],
      applied_migrations: ["0000000000000_baseline"],
      pending_count: 1,
      pending_migrations: [
        {
          name: "1783520000000_personal_identities",
          file_name: "1783520000000_personal_identities.js",
          applied: false
        }
      ],
      errors: []
    });
  });

  it("does not run migrations when nothing is pending", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({
      databaseDir,
      applied: ["0000000000000_baseline.js", "1783520000000_personal_identities.js"]
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

  it("blocks execution when migration status has errors", async () => {
    const databaseDir = await createDatabaseDir();
    const { service } = createService({
      databaseDir,
      queryError: new Error("connect ECONNREFUSED")
    });
    await expect(service.runPendingMigrations(ownerSession)).rejects.toThrow(ConflictException);
  });
});
