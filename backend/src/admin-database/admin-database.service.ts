import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { requireAdminRole } from "../admin-auth/admin-rbac.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { AppConfig } from "../config/app-config.js";
import {
  databaseMigrationRunResponseSchema,
  databaseMigrationStatusSchema,
  type DatabaseMigrationItem,
  type DatabaseMigrationRunResponse,
  type DatabaseMigrationStatus
} from "../contracts/admin-database.js";
import { DatabaseService } from "../database/database.service.js";

const execFileAsync = promisify(execFile);
const migrationFilePattern = /^migrate_v(\d+)_(\d+)\.sql$/;

function compareMigrationFileNames(left: string, right: string): number {
  const leftMatch = migrationFilePattern.exec(left);
  const rightMatch = migrationFilePattern.exec(right);
  if (!leftMatch || !rightMatch) {
    return left.localeCompare(right);
  }
  return Number(leftMatch[1]) - Number(rightMatch[1]) || Number(leftMatch[2]) - Number(rightMatch[2]);
}

interface MigrationTableRow {
  name: string;
}

@Injectable()
export class AdminDatabaseService {
  private readonly logger = new Logger(AdminDatabaseService.name);
  private running = false;

  constructor(
    private readonly config: AppConfig,
    private readonly database: DatabaseService
  ) {}

  async getMigrationStatus(session: AdminSession): Promise<DatabaseMigrationStatus> {
    requireAdminRole(session.role, "admin");
    const status = await this.buildMigrationStatus();
    return databaseMigrationStatusSchema.parse(status);
  }

  async runPendingMigrations(session: AdminSession): Promise<DatabaseMigrationRunResponse> {
    requireAdminRole(session.role, "owner");
    if (this.running) {
      throw new ConflictException("database migration is already running");
    }

    this.running = true;
    try {
      const before = await this.buildMigrationStatus();
      if (before.errors.length) {
        throw new ConflictException(`database migration is not ready: ${before.errors.join("; ")}`);
      }
      if (before.pending_count === 0) {
        const after = await this.buildMigrationStatus();
        return databaseMigrationRunResponseSchema.parse({ ran: false, before, after, stdout: "", stderr: "" });
      }

      this.logger.warn(
        `database migration requested by open_userid=${session.openUserid} tenant_id=${session.tenantId} pending=${before.pending_count}`
      );
      const executable = process.platform === "win32" ? "npm.cmd" : "npm";
      let stdout = "";
      let stderr = "";
      try {
        const result = await execFileAsync(executable, ["run", "migrate"], {
          cwd: before.database_dir,
          env: process.env,
          timeout: 120_000,
          maxBuffer: 1024 * 1024
        });
        stdout = sanitizeOutput(result.stdout ?? "");
        stderr = sanitizeOutput(result.stderr ?? "");
      } catch (error) {
        const failed = error as { stdout?: string; stderr?: string; message?: string };
        stdout = sanitizeOutput(failed.stdout ?? "");
        stderr = sanitizeOutput(failed.stderr ?? failed.message ?? "database migration failed");
        this.logger.error(
          `database migration failed by open_userid=${session.openUserid} tenant_id=${session.tenantId}: ${stderr || stdout}`
        );
        throw new ConflictException({
          message: "database migration failed",
          stdout,
          stderr
        });
      }

      const after = await this.buildMigrationStatus();
      this.logger.log(
        `database migration completed by open_userid=${session.openUserid} tenant_id=${session.tenantId} before=${before.pending_count} after=${after.pending_count}`
      );
      return databaseMigrationRunResponseSchema.parse({ ran: true, before, after, stdout, stderr });
    } finally {
      this.running = false;
    }
  }

  private async buildMigrationStatus(): Promise<DatabaseMigrationStatus> {
    const databaseDir = this.resolveDatabaseDir();
    const errors: string[] = [];
    const checkedAt = new Date().toISOString();
    if (!databaseDir) {
      return this.emptyStatus({
        databaseDir: "",
        configured: false,
        errors: ["DATABASE_DIR is not configured"],
        checkedAt
      });
    }

    const packageJsonPath = path.join(databaseDir, "package.json");
    const migrationsDir = path.join(databaseDir, "migrations");
    const [packageOk, migrationsOk] = await Promise.all([
      this.validatePackageJson(packageJsonPath),
      this.validateDirectory(migrationsDir)
    ]);
    errors.push(...packageOk.errors, ...migrationsOk.errors);

    let migrationFiles: string[] = [];
    if (migrationsOk.ok) {
      migrationFiles = (await fs.readdir(migrationsDir))
        .filter((fileName) => migrationFilePattern.test(fileName))
        .sort(compareMigrationFileNames);
    }

    const table = await this.readAppliedMigrations();
    errors.push(...table.errors);
    const appliedSet = new Set(table.applied.flatMap((name) => [name, `${name}.sql`]));
    const pendingMigrations: DatabaseMigrationItem[] = migrationFiles
      .map((fileName) => ({
        name: fileName.replace(/\.sql$/, ""),
        file_name: fileName,
        applied: appliedSet.has(fileName) || appliedSet.has(fileName.replace(/\.sql$/, ""))
      }))
      .filter((migration) => !migration.applied);

    return {
      database_dir: databaseDir,
      configured: true,
      package_json_path: packageOk.ok ? packageJsonPath : null,
      migrations_dir: migrationsOk.ok ? migrationsDir : null,
      migration_table_exists: table.exists,
      migration_files: migrationFiles,
      applied_migrations: table.applied,
      pending_migrations: pendingMigrations,
      pending_count: pendingMigrations.length,
      errors,
      checked_at: checkedAt
    };
  }

  private resolveDatabaseDir(): string {
    const configured = this.config.databaseDir.trim();
    return configured ? path.resolve(configured) : "";
  }

  private async validatePackageJson(packageJsonPath: string): Promise<{ ok: boolean; errors: string[] }> {
    try {
      const raw = await fs.readFile(packageJsonPath, "utf8");
      const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
      if (parsed.scripts?.migrate !== "node scripts/migrate.cjs") {
        return { ok: false, errors: ["database package.json must expose the canonical migrate script"] };
      }
      return { ok: true, errors: [] };
    } catch (error) {
      return { ok: false, errors: [`database package.json is not readable: ${errorMessage(error)}`] };
    }
  }

  private async validateDirectory(directoryPath: string): Promise<{ ok: boolean; errors: string[] }> {
    try {
      const stat = await fs.stat(directoryPath);
      return stat.isDirectory()
        ? { ok: true, errors: [] }
        : { ok: false, errors: [`${directoryPath} is not a directory`] };
    } catch (error) {
      return { ok: false, errors: [`database migrations directory is not readable: ${errorMessage(error)}`] };
    }
  }

  private async readAppliedMigrations(): Promise<{ exists: boolean; applied: string[]; errors: string[] }> {
    try {
      const tableResult = await this.database.query<{ table_name: string | null }>("SELECT to_regclass('pgmigrations') AS table_name");
      if (!tableResult.rows[0]?.table_name) {
        return { exists: false, applied: [], errors: [] };
      }
      const result = await this.database.query<MigrationTableRow>("SELECT name FROM pgmigrations ORDER BY run_on ASC, name ASC");
      return { exists: true, applied: result.rows.map((row) => row.name), errors: [] };
    } catch (error) {
      return { exists: false, applied: [], errors: [`cannot read migration table: ${errorMessage(error)}`] };
    }
  }

  private emptyStatus(input: {
    databaseDir: string;
    configured: boolean;
    errors: string[];
    checkedAt: string;
  }): DatabaseMigrationStatus {
    return {
      database_dir: input.databaseDir,
      configured: input.configured,
      package_json_path: null,
      migrations_dir: null,
      migration_table_exists: false,
      migration_files: [],
      applied_migrations: [],
      pending_migrations: [],
      pending_count: 0,
      errors: input.errors,
      checked_at: input.checkedAt
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeOutput(output: string): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return output;
  }
  return output.replaceAll(databaseUrl, "[DATABASE_URL]");
}
