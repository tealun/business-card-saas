import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService, type DatabaseTransaction } from "../database/database.service.js";
import { normalizePlatformAdminRole, type PlatformAdminRole } from "../contracts/admin-auth.js";
import type { PlatformAdminSummary } from "../contracts/admin-observability.js";

// platform_admins is a platform-level table (no tenant RLS): password login
// happens before any tenant context exists, like callback_events.

export interface PlatformAdminRecord {
  id: string;
  username: string;
  passwordHash: string;
  tenantId: string;
  tenantName: string;
  role: PlatformAdminRole;
  status: string;
}

// Thrown when the username unique index rejects an insert; the service maps it
// to a 409 so a concurrent create cannot slip past a check-then-insert gap.
export class PlatformUsernameTakenError extends Error {
  constructor(readonly username: string) {
    super(`platform admin username '${username}' already exists`);
    this.name = "PlatformUsernameTakenError";
  }
}

const BOOTSTRAP_CORPID = "platform:bootstrap";

interface PlatformAdminRow extends QueryResultRow {
  id: string | number | bigint;
  username: string;
  password_hash: string;
  tenant_id: string | number | bigint;
  tenant_name: string;
  role: string;
  status: string;
}

interface PlatformAdminSummaryRow extends QueryResultRow {
  admin_id: string | number | bigint;
  username: string;
  role: string;
  status: string;
  password_updated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class PlatformAdminRepository {
  private readonly memory = new Map<string, PlatformAdminRecord>();
  private readonly memoryCreatedAt = new Map<string, string>();
  private memorySequence = 0;

  constructor(@Optional() private readonly database?: DatabaseService) {}

  async findByUsername(username: string): Promise<PlatformAdminRecord | null> {
    if (!this.hasDatabase()) {
      return this.memory.get(username) ?? null;
    }
    const result = await this.database!.query<PlatformAdminRow>(
      `
        SELECT p.id, p.username, p.password_hash, p.tenant_id, t.name AS tenant_name, p.role, p.status
        FROM platform_admins p
        JOIN tenants t ON t.id = p.tenant_id
        WHERE p.username = $1
        LIMIT 1
      `,
      [username]
    );
    return this.rowToRecord(result.rows[0]);
  }

  async findById(id: string): Promise<PlatformAdminRecord | null> {
    if (!this.hasDatabase()) {
      for (const record of this.memory.values()) {
        if (record.id === id) {
          return record;
        }
      }
      return null;
    }
    const result = await this.database!.query<PlatformAdminRow>(
      `
        SELECT p.id, p.username, p.password_hash, p.tenant_id, t.name AS tenant_name, p.role, p.status
        FROM platform_admins p
        JOIN tenants t ON t.id = p.tenant_id
        WHERE p.id = $1
        LIMIT 1
      `,
      [id]
    );
    return this.rowToRecord(result.rows[0]);
  }

  async createWithBootstrapTenant(input: {
    username: string;
    passwordHash: string;
    tenantName: string;
  }): Promise<PlatformAdminRecord> {
    if (!this.hasDatabase()) {
      this.memorySequence += 1;
      const record: PlatformAdminRecord = {
        id: String(this.memorySequence),
        username: input.username,
        passwordHash: input.passwordHash,
        tenantId: `platform-${this.memorySequence}`,
        tenantName: input.tenantName,
        role: "platform_owner",
        status: "active"
      };
      this.memory.set(input.username, record);
      this.memoryCreatedAt.set(input.username, new Date().toISOString());
      return record;
    }
    return this.database!.transaction(async (tx) => {
      // Avoids newer optional tenant columns (tenant_type) so bootstrap works
      // even while migrations are still pending.
      const tenant = await this.ensureBootstrapTenant(tx, input.tenantName);
      const created = await tx.query<PlatformAdminRow>(
        `
          INSERT INTO platform_admins (username, password_hash, tenant_id, role, status, created_at, updated_at)
          VALUES ($1, $2, $3, 'platform_owner', 'active', now(), now())
          RETURNING id, username, password_hash, tenant_id, role, status
        `,
        [input.username, input.passwordHash, tenant.id]
      );
      const record = this.rowToRecord({ ...created.rows[0]!, tenant_name: tenant.name });
      if (!record) {
        throw new Error("failed to create platform admin");
      }
      return record;
    });
  }

  async createAccount(input: {
    username: string;
    passwordHash: string;
    role: PlatformAdminRole;
    createdBy: string;
  }): Promise<PlatformAdminSummary> {
    if (!this.hasDatabase()) {
      if (this.memory.has(input.username)) {
        throw new PlatformUsernameTakenError(input.username);
      }
      this.memorySequence += 1;
      const record: PlatformAdminRecord = {
        id: String(this.memorySequence),
        username: input.username,
        passwordHash: input.passwordHash,
        tenantId: `platform-${this.memorySequence}`,
        tenantName: "平台运营",
        role: input.role,
        status: "active"
      };
      this.memory.set(input.username, record);
      const now = new Date().toISOString();
      this.memoryCreatedAt.set(input.username, now);
      return {
        admin_id: record.id,
        username: record.username,
        role: record.role,
        status: record.status,
        password_updated_at: null,
        created_at: now,
        updated_at: now
      };
    }
    try {
      return await this.database!.transaction(async (tx) => {
        const tenant = await this.ensureBootstrapTenant(tx, "平台运营");
        // migrate_v1_14 adds platform_admins.created_by; detect the column so
        // account creation keeps working on databases where the migration is
        // still pending (same tolerance pattern as the tenant upsert above).
        const createdByColumn = await tx.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_admins' AND column_name = 'created_by' LIMIT 1`
        );
        const hasCreatedBy = createdByColumn.rows.length > 0;
        const created = hasCreatedBy
          ? await tx.query<PlatformAdminSummaryRow>(
              `
                INSERT INTO platform_admins (username, password_hash, tenant_id, role, status, created_by, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'active', $5, now(), now())
                RETURNING id AS admin_id, username, role, status, password_updated_at, created_at, updated_at
              `,
              [input.username, input.passwordHash, tenant.id, input.role, input.createdBy]
            )
          : await tx.query<PlatformAdminSummaryRow>(
              `
                INSERT INTO platform_admins (username, password_hash, tenant_id, role, status, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'active', now(), now())
                RETURNING id AS admin_id, username, role, status, password_updated_at, created_at, updated_at
              `,
              [input.username, input.passwordHash, tenant.id, input.role]
            );
        const row = created.rows[0];
        if (!row) {
          throw new Error("failed to create platform admin");
        }
        return toSummary(row);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new PlatformUsernameTakenError(input.username);
      }
      throw error;
    }
  }

  async updatePassword(username: string, passwordHash: string): Promise<boolean> {
    if (!this.hasDatabase()) {
      const record = this.memory.get(username);
      if (!record) {
        return false;
      }
      this.memory.set(username, { ...record, passwordHash });
      return true;
    }
    const result = await this.database!.query(
      `
        UPDATE platform_admins
        SET password_hash = $2, password_updated_at = now(), updated_at = now()
        WHERE username = $1 AND status = 'active'
      `,
      [username, passwordHash]
    );
    return (result.rowCount ?? 0) > 0;
  }

  // blockedUsernames re-asserts the service-layer protections (built-in owner)
  // atomically with the write, so a check-then-act race cannot demote a
  // protected account (same pattern as updateTenantAdminStatus, see 99_71).
  async updateRoleById(
    id: string,
    role: PlatformAdminRole,
    blockedUsernames: string[]
  ): Promise<PlatformAdminSummary | null> {
    if (!this.hasDatabase()) {
      const record = await this.findById(id);
      if (!record || blockedUsernames.includes(record.username)) {
        return null;
      }
      this.memory.set(record.username, { ...record, role });
      return this.memorySummary({ ...record, role });
    }
    const result = await this.database!.query<PlatformAdminSummaryRow>(
      `
        UPDATE platform_admins
        SET role = $2, updated_at = now()
        WHERE id = $1 AND NOT (username = ANY($3::text[]))
        RETURNING id AS admin_id, username, role, status, password_updated_at, created_at, updated_at
      `,
      [id, role, blockedUsernames]
    );
    const row = result.rows[0];
    return row ? toSummary(row) : null;
  }

  // Hard delete. blockedUsernames (current operator + built-in owner) is enforced
  // in the same statement so a concurrent session rename/protection change cannot
  // be bypassed between the service pre-check and the write.
  async deleteById(id: string, blockedUsernames: string[]): Promise<boolean> {
    if (!this.hasDatabase()) {
      const record = await this.findById(id);
      if (!record || blockedUsernames.includes(record.username)) {
        return false;
      }
      this.memory.delete(record.username);
      this.memoryCreatedAt.delete(record.username);
      return true;
    }
    const result = await this.database!.query(
      `
        DELETE FROM platform_admins
        WHERE id = $1 AND NOT (username = ANY($2::text[]))
      `,
      [id, blockedUsernames]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async ensureBootstrapTenant(
    tx: DatabaseTransaction,
    tenantName: string
  ): Promise<{ id: string | number | bigint; name: string }> {
    const tenant = await tx.query<{ id: string | number | bigint; name: string }>(
      `
        INSERT INTO tenants (name, creation_source, open_corpid, auth_status, created_at, updated_at)
        VALUES ($1, 'local', $2, 'unconnected', now(), now())
        ON CONFLICT (open_corpid) WHERE open_corpid IS NOT NULL DO UPDATE SET updated_at = now()
        RETURNING id, name
      `,
      [tenantName, BOOTSTRAP_CORPID]
    );
    const row = tenant.rows[0];
    if (!row) {
      throw new Error("failed to create bootstrap tenant");
    }
    return row;
  }

  private memorySummary(record: PlatformAdminRecord): PlatformAdminSummary {
    const createdAt = this.memoryCreatedAt.get(record.username) ?? new Date().toISOString();
    return {
      admin_id: record.id,
      username: record.username,
      role: record.role,
      status: record.status,
      password_updated_at: null,
      created_at: createdAt,
      updated_at: new Date().toISOString()
    };
  }

  private rowToRecord(row: PlatformAdminRow | undefined): PlatformAdminRecord | null {
    if (!row) {
      return null;
    }
    return {
      id: String(row.id),
      username: row.username,
      passwordHash: row.password_hash,
      tenantId: String(row.tenant_id),
      tenantName: row.tenant_name,
      role: requirePlatformRole(row.role, String(row.id)),
      status: row.status
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function toSummary(row: PlatformAdminSummaryRow): PlatformAdminSummary {
  return {
    admin_id: String(row.admin_id),
    username: row.username,
    role: requirePlatformRole(row.role, String(row.admin_id)),
    status: row.status,
    password_updated_at: row.password_updated_at ? iso(row.password_updated_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at)
  };
}

// Legacy 'owner' rows read as 'platform_owner' until migrate_v1_14 runs; a value
// outside the 01_08 enum means data corruption and must fail loudly, not be
// silently granted capabilities.
function requirePlatformRole(role: string, id: string): PlatformAdminRole {
  const normalized = normalizePlatformAdminRole(role);
  if (!normalized) {
    throw new Error(`platform_admins row ${id} has unexpected role '${role}'`);
  }
  return normalized;
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}
