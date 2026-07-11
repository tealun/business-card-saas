import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import type { AdminRole } from "../contracts/admin-auth.js";

// platform_admins is a platform-level table (no tenant RLS): password login
// happens before any tenant context exists, like callback_events.

export interface PlatformAdminRecord {
  id: string;
  username: string;
  passwordHash: string;
  tenantId: string;
  tenantName: string;
  role: AdminRole;
  status: string;
}

const BOOTSTRAP_CORPID = "platform:bootstrap";

interface PlatformAdminRow extends QueryResultRow {
  id: string | number | bigint;
  username: string;
  password_hash: string;
  tenant_id: string | number | bigint;
  tenant_name: string;
  role: AdminRole;
  status: string;
}

@Injectable()
export class PlatformAdminRepository {
  private readonly memory = new Map<string, PlatformAdminRecord>();
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
        role: "owner",
        status: "active"
      };
      this.memory.set(input.username, record);
      return record;
    }
    return this.database!.transaction(async (tx) => {
      // Avoids newer optional tenant columns (tenant_type) so bootstrap works
      // even while migrations are still pending.
      const tenant = await tx.query<{ id: string | number | bigint; name: string }>(
        `
          INSERT INTO tenants (name, open_corpid, auth_status, created_at, updated_at)
          VALUES ($1, $2, 'active', now(), now())
          ON CONFLICT (open_corpid) DO UPDATE SET updated_at = now()
          RETURNING id, name
        `,
        [input.tenantName, BOOTSTRAP_CORPID]
      );
      const tenantRow = tenant.rows[0];
      if (!tenantRow) {
        throw new Error("failed to create bootstrap tenant");
      }
      const created = await tx.query<PlatformAdminRow>(
        `
          INSERT INTO platform_admins (username, password_hash, tenant_id, role, status, created_at, updated_at)
          VALUES ($1, $2, $3, 'owner', 'active', now(), now())
          RETURNING id, username, password_hash, tenant_id, role, status
        `,
        [input.username, input.passwordHash, tenantRow.id]
      );
      const record = this.rowToRecord({ ...created.rows[0]!, tenant_name: tenantRow.name });
      if (!record) {
        throw new Error("failed to create platform admin");
      }
      return record;
    });
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
      role: row.role,
      status: row.status
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}
