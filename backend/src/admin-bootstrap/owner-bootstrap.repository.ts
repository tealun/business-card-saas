import { ConflictException, Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { TenantTx } from "../database/tenant-tx.service.js";

export type TenantAdminRole = "owner" | "admin" | "operator" | "auditor";

export interface TenantAdminRecord {
  tenantId: string;
  memberIdentityId: string | null;
  openUserid: string;
  role: TenantAdminRole;
}

export interface AdminClaimTokenRecord {
  tenantId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

@Injectable()
export class OwnerBootstrapRepository {
  private readonly tenantAdmins = new Map<string, TenantAdminRecord>();
  private readonly claimTokens = new Map<string, AdminClaimTokenRecord>();

  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  hasOwner(tenantId: string): boolean {
    return Array.from(this.tenantAdmins.values()).some(
      (admin) => admin.tenantId === tenantId && admin.role === "owner"
    );
  }

  createOwner(input: { tenantId: string; memberIdentityId?: string; openUserid: string }): TenantAdminRecord {
    if (this.hasOwner(input.tenantId)) {
      throw new ConflictException("tenant owner already exists");
    }
    const key = `${input.tenantId}:${input.openUserid}`;
    if (this.tenantAdmins.has(key)) {
      throw new ConflictException("tenant admin already exists");
    }
    const record: TenantAdminRecord = {
      tenantId: input.tenantId,
      memberIdentityId: input.memberIdentityId ?? null,
      openUserid: input.openUserid,
      role: "owner"
    };
    this.tenantAdmins.set(key, record);
    return record;
  }

  createClaimToken(input: { tenantId: string; tokenHash: string; expiresAt: Date }): AdminClaimTokenRecord {
    if (this.hasOwner(input.tenantId)) {
      throw new ConflictException("tenant owner already exists");
    }
    if (this.claimTokens.has(input.tokenHash)) {
      throw new ConflictException("admin claim token already exists");
    }
    const record: AdminClaimTokenRecord = {
      tenantId: input.tenantId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null
    };
    this.claimTokens.set(input.tokenHash, record);
    return record;
  }

  findClaimToken(tokenHash: string): AdminClaimTokenRecord | undefined {
    return this.claimTokens.get(tokenHash);
  }

  async findActiveAdmin(input: { tenantId: string; openUserid: string }): Promise<TenantAdminRecord | null> {
    if (!this.hasDatabase()) {
      return this.tenantAdmins.get(`${input.tenantId}:${input.openUserid}`) ?? null;
    }

    const result = await this.tenantTx!.run(input.tenantId, (tx) =>
      tx.query<TenantAdminRow>(
        `
          SELECT tenant_id, member_identity_id, open_userid, role
          FROM tenant_admins
          WHERE tenant_id = $1
            AND open_userid = $2
            AND status = 'active'
          LIMIT 1
        `,
        [input.tenantId, input.openUserid]
      )
    );
    return this.rowToAdmin(result.rows[0]);
  }

  private rowToAdmin(row: TenantAdminRow | undefined): TenantAdminRecord | null {
    if (!row) {
      return null;
    }
    return {
      tenantId: String(row.tenant_id),
      memberIdentityId: row.member_identity_id === null ? null : String(row.member_identity_id),
      openUserid: row.open_userid,
      role: row.role
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

interface TenantAdminRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  member_identity_id: string | number | bigint | null;
  open_userid: string;
  role: TenantAdminRole;
}
