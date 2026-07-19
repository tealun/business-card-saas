import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { TenantTx } from "../database/tenant-tx.service.js";
import type { TenantAdminRole } from "../admin-bootstrap/owner-bootstrap.repository.js";

export interface AdminWecomScanAdmin {
  tenantId: string;
  tenantName: string;
  memberIdentityId: string | null;
  openUserid: string;
  role: TenantAdminRole;
  status: "active" | "disabled";
}

interface AdminRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  tenant_name: string;
  member_identity_id: string | number | bigint | null;
  open_userid: string;
  role: TenantAdminRole;
  status: "active" | "disabled";
}

interface MemberRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
}

interface CardRow extends QueryResultRow {
  id: string | number | bigint;
  public_id: string;
}

@Injectable()
export class AdminWecomScanRepository {
  private readonly memory = new Map<string, AdminWecomScanAdmin>();

  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  async upsertFromScan(input: {
    tenantId: string;
    tenantName: string;
    userid: string;
    openUserid: string;
  }): Promise<AdminWecomScanAdmin> {
    if (!this.hasDatabase()) {
      return this.upsertMemory(input);
    }

    return this.tenantTx!.run(input.tenantId, async (tx) => {
      const member = await tx.query<MemberRow>(
        `
          INSERT INTO member_identities (tenant_id, userid, open_userid, name, status, created_at, updated_at)
          VALUES ($1, $2, $3, $4, 'active', now(), now())
          ON CONFLICT (tenant_id, open_userid) DO UPDATE SET
            userid = COALESCE(EXCLUDED.userid, member_identities.userid),
            status = 'active',
            updated_at = now()
          RETURNING id, name
        `,
        [input.tenantId, input.userid, input.openUserid, input.userid]
      );
      const memberIdentityId = String(member.rows[0]?.id ?? "");
      if (!memberIdentityId) {
        throw new Error("failed to upsert WeCom admin member identity");
      }

      const current = await tx.query<AdminRow>(
        `
          SELECT a.tenant_id, t.name AS tenant_name, a.member_identity_id, a.open_userid, a.role, a.status
          FROM tenant_admins a
          JOIN tenants t ON t.id = a.tenant_id
          WHERE a.tenant_id = $1 AND a.open_userid = $2
          LIMIT 1
        `,
        [input.tenantId, input.openUserid]
      );
      const currentAdmin = rowToAdmin(current.rows[0]);
      if (currentAdmin) {
        if (currentAdmin.status === "disabled") {
          return currentAdmin;
        }
        await this.ensureDefaultCard(tx, {
          tenantId: input.tenantId,
          memberIdentityId,
          displayName: member.rows[0]?.name || input.userid
        });
        const updated = await tx.query<AdminRow>(
          `
            UPDATE tenant_admins
            SET member_identity_id = COALESCE(member_identity_id, $3),
                last_login_at = now(),
                auth_source = 'wecom_scan',
                updated_at = now()
            WHERE tenant_id = $1 AND open_userid = $2 AND status = 'active'
            RETURNING tenant_id, $4::text AS tenant_name, member_identity_id, open_userid, role, status
          `,
          [input.tenantId, input.openUserid, memberIdentityId, input.tenantName]
        );
        return requireAdmin(updated.rows[0]);
      }

      await this.ensureDefaultCard(tx, {
        tenantId: input.tenantId,
        memberIdentityId,
        displayName: member.rows[0]?.name || input.userid
      });

      const hasOwner = await tx.query(
        `
          SELECT 1
          FROM tenant_admins
          WHERE tenant_id = $1 AND role = 'owner' AND status = 'active'
          LIMIT 1
        `,
        [input.tenantId]
      );
      const role: TenantAdminRole = hasOwner.rows[0] ? "admin" : "owner";
      try {
        const created = await tx.query<AdminRow>(
          `
            INSERT INTO tenant_admins (
              tenant_id, member_identity_id, open_userid, role, status,
              last_login_at, auth_source, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, 'active', now(), 'wecom_scan', now(), now())
            RETURNING tenant_id, $5::text AS tenant_name, member_identity_id, open_userid, role, status
          `,
          [input.tenantId, memberIdentityId, input.openUserid, role, input.tenantName]
        );
        return requireAdmin(created.rows[0]);
      } catch (error) {
        if (!isUniqueViolation(error) || role !== "owner") {
          throw error;
        }
        const created = await tx.query<AdminRow>(
          `
            INSERT INTO tenant_admins (
              tenant_id, member_identity_id, open_userid, role, status,
              last_login_at, auth_source, created_at, updated_at
            )
            VALUES ($1, $2, $3, 'admin', 'active', now(), 'wecom_scan', now(), now())
            RETURNING tenant_id, $4::text AS tenant_name, member_identity_id, open_userid, role, status
          `,
          [input.tenantId, memberIdentityId, input.openUserid, input.tenantName]
        );
        return requireAdmin(created.rows[0]);
      }
    });
  }

  private upsertMemory(input: {
    tenantId: string;
    tenantName: string;
    userid: string;
    openUserid: string;
  }): AdminWecomScanAdmin {
    const key = `${input.tenantId}:${input.openUserid}`;
    const current = this.memory.get(key);
    if (current) {
      return current;
    }
    const hasOwner = Array.from(this.memory.values()).some(
      (admin) => admin.tenantId === input.tenantId && admin.role === "owner" && admin.status === "active"
    );
    const admin: AdminWecomScanAdmin = {
      tenantId: input.tenantId,
      tenantName: input.tenantName,
      memberIdentityId: `memory-member-${this.memory.size + 1}`,
      openUserid: input.openUserid,
      role: hasOwner ? "admin" : "owner",
      status: "active"
    };
    this.memory.set(key, admin);
    return admin;
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  private async ensureDefaultCard(
    tx: {
      query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
    },
    input: {
      tenantId: string;
      memberIdentityId: string;
      displayName: string;
    }
  ): Promise<void> {
    const existing = await tx.query<CardRow>(
      `
        SELECT id, public_id
        FROM cards
        WHERE tenant_id = $1
          AND member_identity_id = $2
          AND card_type = 'primary'
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [input.tenantId, input.memberIdentityId]
    );
    const card = existing.rows[0] ?? (await this.createDefaultCard(tx, input));
    await tx.query(
      `
        INSERT INTO public_card_directory (
          public_id,
          tenant_id,
          card_id,
          status,
          card_updated_at,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'active', now(), now(), now())
        ON CONFLICT (public_id) DO UPDATE SET
          status = 'active',
          card_updated_at = now(),
          updated_at = now()
        WHERE public_card_directory.tenant_id = EXCLUDED.tenant_id
          AND public_card_directory.card_id = EXCLUDED.card_id
      `,
      [card.public_id, input.tenantId, String(card.id)]
    );
  }

  private async createDefaultCard(
    tx: {
      query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
    },
    input: {
      tenantId: string;
      memberIdentityId: string;
      displayName: string;
    }
  ): Promise<CardRow> {
    const publicId = defaultEmployeePublicId({
      tenantId: input.tenantId,
      memberIdentityId: input.memberIdentityId
    });
    const inserted = await tx.query<CardRow>(
      `
        INSERT INTO cards (
          tenant_id,
          member_identity_id,
          public_id,
          card_type,
          slug,
          display_name,
          privacy_json,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'primary', $4, $5, $6, 'active', now(), now())
        RETURNING id, public_id
      `,
      [
        input.tenantId,
        input.memberIdentityId,
        publicId,
        defaultEmployeeCardSlug(input),
        input.displayName,
        JSON.stringify({ show_mobile: false, show_email: true, show_wechat: false, allow_forward: true })
      ]
    );
    const card = inserted.rows[0];
    if (!card) {
      throw new Error("failed to create default WeCom scan admin card");
    }
    return card;
  }
}

function requireAdmin(row: AdminRow | undefined): AdminWecomScanAdmin {
  const admin = rowToAdmin(row);
  if (!admin) {
    throw new Error("failed to upsert tenant admin from WeCom scan");
  }
  return admin;
}

function rowToAdmin(row: AdminRow | undefined): AdminWecomScanAdmin | null {
  if (!row) {
    return null;
  }
  return {
    tenantId: String(row.tenant_id),
    tenantName: row.tenant_name,
    memberIdentityId: row.member_identity_id === null ? null : String(row.member_identity_id),
    openUserid: row.open_userid,
    role: row.role,
    status: row.status
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505");
}
