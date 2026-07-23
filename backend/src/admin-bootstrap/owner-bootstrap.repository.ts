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

export interface ClaimOwnerInput {
  tenantId: string;
  tokenHash: string;
  memberIdentityId?: string;
  openUserid: string;
}

@Injectable()
export class OwnerBootstrapRepository {
  private readonly tenantAdmins = new Map<string, TenantAdminRecord>();
  private readonly claimTokens = new Map<string, AdminClaimTokenRecord>();

  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  async hasOwner(tenantId: string): Promise<boolean> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, (tx) =>
        tx.query(
          `
            SELECT 1
            FROM tenant_admins
            WHERE tenant_id = $1
              AND role = 'owner'
              AND status = 'active'
            LIMIT 1
          `,
          [tenantId]
        )
      );
      return Boolean(result.rows[0]);
    }
    return this.hasOwnerInMemory(tenantId);
  }

  async createOwner(input: { tenantId: string; memberIdentityId?: string; openUserid: string }): Promise<TenantAdminRecord> {
    if (this.hasDatabase()) {
      try {
        return await this.tenantTx!.run(input.tenantId, async (tx) => {
          const existing = await tx.query(
            `
              SELECT 1
              FROM tenant_admins
              WHERE tenant_id = $1
                AND role = 'owner'
                AND status = 'active'
              LIMIT 1
            `,
            [input.tenantId]
          );
          if (existing.rows[0]) {
            throw new ConflictException("tenant owner already exists");
          }

          const result = await tx.query<TenantAdminRow>(
            `
              INSERT INTO tenant_admins (
                tenant_id,
                member_identity_id,
                open_userid,
                role,
                status,
                created_at,
                updated_at
              )
              VALUES ($1, $2, $3, 'owner', 'active', now(), now())
              RETURNING tenant_id, member_identity_id, open_userid, role
            `,
            [input.tenantId, input.memberIdentityId ?? null, input.openUserid]
          );
          const owner = this.rowToAdmin(result.rows[0]);
          if (!owner) {
            throw new Error("failed to create tenant owner");
          }
          return owner;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException("tenant owner already exists");
        }
        throw error;
      }
    }

    return this.createOwnerInMemory(input);
  }

  async createClaimToken(input: { tenantId: string; tokenHash: string; expiresAt: Date }): Promise<AdminClaimTokenRecord> {
    return (await this.createClaimTokens({ tenantId: input.tenantId, tokenHashes: [input.tokenHash], expiresAt: input.expiresAt }))[0]!;
  }

  async createClaimTokens(input: { tenantId: string; tokenHashes: string[]; expiresAt: Date }): Promise<AdminClaimTokenRecord[]> {
    const tokenHashes = [...new Set(input.tokenHashes.map((hash) => hash.trim()).filter(Boolean))];
    if (!tokenHashes.length) {
      throw new ConflictException("admin claim token is required");
    }

    if (this.hasDatabase()) {
      if (await this.hasOwner(input.tenantId)) {
        throw new ConflictException("tenant owner already exists");
      }
      try {
        const result = await this.tenantTx!.run(input.tenantId, (tx) =>
          tx.query<AdminClaimTokenRow>(
            `
              INSERT INTO admin_claim_tokens (
                tenant_id,
                token_hash,
                expires_at,
                used_at,
                created_at
              )
              SELECT $1, token_hash, $3, NULL, now()
              FROM unnest($2::text[]) AS token_hash
              RETURNING tenant_id, token_hash, expires_at, used_at
            `,
            [input.tenantId, tokenHashes, input.expiresAt]
          )
        );
        const records = result.rows.flatMap((row) => {
          const record = this.rowToClaimToken(row);
          return record ? [record] : [];
        });
        if (records.length !== tokenHashes.length) {
          throw new Error("failed to create admin claim token");
        }
        return records;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException("admin claim token already exists");
        }
        throw error;
      }
    }

    if (this.hasOwnerInMemory(input.tenantId)) {
      throw new ConflictException("tenant owner already exists");
    }
    if (tokenHashes.some((tokenHash) => this.claimTokens.has(tokenHash))) {
      throw new ConflictException("admin claim token already exists");
    }
    const records = tokenHashes.map((tokenHash) => ({
      tenantId: input.tenantId,
      tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null
    }));
    records.forEach((record) => this.claimTokens.set(record.tokenHash, record));
    return records;
  }

  async claimOwner(input: ClaimOwnerInput): Promise<TenantAdminRecord | null> {
    if (this.hasDatabase()) {
      try {
        return await this.tenantTx!.run(input.tenantId, async (tx) => {
          const tokenResult = await tx.query<AdminClaimTokenRow>(
            `
              SELECT tenant_id, token_hash, expires_at, used_at
              FROM admin_claim_tokens
              WHERE tenant_id = $1
                AND token_hash = $2
              LIMIT 1
            `,
            [input.tenantId, input.tokenHash]
          );
          const token = this.rowToClaimToken(tokenResult.rows[0]);
          if (!token || token.usedAt || token.expiresAt.getTime() <= Date.now()) {
            return null;
          }

          const existingOwner = await tx.query(
            `
              SELECT 1
              FROM tenant_admins
              WHERE tenant_id = $1
                AND role = 'owner'
                AND status = 'active'
              LIMIT 1
            `,
            [input.tenantId]
          );
          if (existingOwner.rows[0]) {
            return null;
          }

          const consumed = await tx.query<AdminClaimTokenRow>(
            `
              UPDATE admin_claim_tokens
              SET used_at = now()
              WHERE tenant_id = $1
                AND used_at IS NULL
                AND expires_at > now()
                AND EXISTS (
                  SELECT 1
                  FROM admin_claim_tokens
                  WHERE tenant_id = $1
                    AND token_hash = $2
                    AND used_at IS NULL
                    AND expires_at > now()
                )
              RETURNING tenant_id, token_hash, expires_at, used_at
            `,
            [input.tenantId, input.tokenHash]
          );
          if (!consumed.rows[0]) {
            return null;
          }

          const ownerResult = await tx.query<TenantAdminRow>(
            `
              INSERT INTO tenant_admins (
                tenant_id,
                member_identity_id,
                open_userid,
                role,
                status,
                created_at,
                updated_at
              )
              VALUES ($1, $2, $3, 'owner', 'active', now(), now())
              RETURNING tenant_id, member_identity_id, open_userid, role
            `,
            [input.tenantId, input.memberIdentityId ?? null, input.openUserid]
          );
          return this.rowToAdmin(ownerResult.rows[0]);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return null;
        }
        throw error;
      }
    }

    const token = this.claimTokens.get(input.tokenHash);
    if (
      !token ||
      token.tenantId !== input.tenantId ||
      token.usedAt ||
      token.expiresAt.getTime() <= Date.now() ||
      this.hasOwnerInMemory(input.tenantId)
    ) {
      return null;
    }

    const owner = this.createOwnerInMemory(input);
    const usedAt = new Date();
    for (const [hash, record] of this.claimTokens.entries()) {
      if (record.tenantId === input.tenantId && !record.usedAt && record.expiresAt.getTime() > Date.now()) {
        this.claimTokens.set(hash, { ...record, usedAt });
      }
    }
    return owner;
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

  private hasOwnerInMemory(tenantId: string): boolean {
    return Array.from(this.tenantAdmins.values()).some(
      (admin) => admin.tenantId === tenantId && admin.role === "owner"
    );
  }

  private createOwnerInMemory(input: { tenantId: string; memberIdentityId?: string; openUserid: string }): TenantAdminRecord {
    if (this.hasOwnerInMemory(input.tenantId)) {
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

  private rowToClaimToken(row: AdminClaimTokenRow | undefined): AdminClaimTokenRecord | null {
    if (!row) {
      return null;
    }
    return {
      tenantId: String(row.tenant_id),
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      usedAt: row.used_at === null ? null : new Date(row.used_at)
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

interface AdminClaimTokenRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
