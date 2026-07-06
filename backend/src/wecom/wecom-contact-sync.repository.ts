import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";

export interface SyncWecomContactUser {
  userid: string | null;
  openUserid: string | null;
  name: string | null;
  departmentIds: string[];
  status: "active" | "disabled";
}

export interface SyncWecomContactMembersInput {
  tenantId: string;
  tenantName: string;
  users: SyncWecomContactUser[];
}

export interface SyncWecomContactMembersResult {
  syncedCount: number;
  skippedCount: number;
}

interface MemberIdentityRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
}

interface CardRow extends QueryResultRow {
  id: string | number | bigint;
  public_id: string;
}

interface MemberIdentityConflictRow extends QueryResultRow {
  id: string | number | bigint;
}

@Injectable()
export class WecomContactSyncRepository {
  private readonly memory = new Map<string, SyncWecomContactUser[]>();

  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  async upsertMembers(input: SyncWecomContactMembersInput): Promise<SyncWecomContactMembersResult> {
    const normalized = input.users.map(normalizeUser).filter((user) => user.openUserid || user.userid);
    const skippedCount = input.users.length - normalized.length;
    if (!this.hasDatabase()) {
      this.memory.set(input.tenantId, normalized.map((user) => ({ ...user, departmentIds: [...user.departmentIds] })));
      return { syncedCount: normalized.length, skippedCount };
    }

    await this.tenantTx!.run(input.tenantId, async (tx) => {
      for (const user of normalized) {
        const member = await this.upsertMember(tx, input.tenantId, user);
        await this.ensureDefaultCard(tx, {
          tenantId: input.tenantId,
          tenantName: input.tenantName,
          memberIdentityId: String(member.id),
          displayName: member.name,
          status: user.status
        });
      }
    });
    return { syncedCount: normalized.length, skippedCount };
  }

  private async upsertMember(
    tx: TenantTransactionClient,
    tenantId: string,
    user: SyncWecomContactUser
  ): Promise<MemberIdentityRow> {
    const existing = await tx.query<MemberIdentityRow>(
      `
        SELECT id, name
        FROM member_identities
        WHERE tenant_id = $1
          AND (
            ($2::text IS NOT NULL AND open_userid = $2)
            OR ($3::text IS NOT NULL AND userid = $3)
          )
        ORDER BY id ASC
        LIMIT 1
      `,
      [tenantId, user.openUserid, user.userid]
    );
    const current = existing.rows[0];
    const displayName = user.name ?? user.openUserid ?? user.userid ?? "WeCom Member";
    if (current) {
      const nextOpenUserid = (await this.isOpenUseridOwnedByAnotherMember(tx, tenantId, user.openUserid, current.id))
        ? null
        : user.openUserid;
      const nextUserid = (await this.isUseridOwnedByAnotherMember(tx, tenantId, user.userid, current.id))
        ? null
        : user.userid;
      const updated = await tx.query<MemberIdentityRow>(
        `
          UPDATE member_identities
          SET userid = COALESCE($3, userid),
              open_userid = COALESCE($2, open_userid),
              name = $4,
              department_json = $5,
              status = $6,
              updated_at = now()
          WHERE tenant_id = $1 AND id = $7
          RETURNING id, name
        `,
        [
          tenantId,
          nextOpenUserid,
          nextUserid,
          displayName,
          JSON.stringify(user.departmentIds),
          user.status,
          current.id
        ]
      );
      return requireMemberRow(updated.rows[0]);
    }

    const inserted = await tx.query<MemberIdentityRow>(
      `
        INSERT INTO member_identities (
          tenant_id,
          userid,
          open_userid,
          name,
          department_json,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, now(), now())
        RETURNING id, name
      `,
      [tenantId, user.userid, user.openUserid, displayName, JSON.stringify(user.departmentIds), user.status]
    );
    return requireMemberRow(inserted.rows[0]);
  }

  private async isOpenUseridOwnedByAnotherMember(
    tx: TenantTransactionClient,
    tenantId: string,
    openUserid: string | null,
    currentMemberId: string | number | bigint
  ): Promise<boolean> {
    if (!openUserid) {
      return false;
    }
    const result = await tx.query<MemberIdentityConflictRow>(
      `
        SELECT id
        FROM member_identities
        WHERE tenant_id = $1 AND open_userid = $2 AND id <> $3
        LIMIT 1
      `,
      [tenantId, openUserid, currentMemberId]
    );
    return Boolean(result.rows[0]);
  }

  private async isUseridOwnedByAnotherMember(
    tx: TenantTransactionClient,
    tenantId: string,
    userid: string | null,
    currentMemberId: string | number | bigint
  ): Promise<boolean> {
    if (!userid) {
      return false;
    }
    const result = await tx.query<MemberIdentityConflictRow>(
      `
        SELECT id
        FROM member_identities
        WHERE tenant_id = $1 AND userid = $2 AND id <> $3
        LIMIT 1
      `,
      [tenantId, userid, currentMemberId]
    );
    return Boolean(result.rows[0]);
  }

  private async ensureDefaultCard(
    tx: TenantTransactionClient,
    input: {
      tenantId: string;
      tenantName: string;
      memberIdentityId: string;
      displayName: string;
      status: "active" | "disabled";
    }
  ): Promise<CardRow> {
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
    if (existing.rows[0]) {
      await tx.query(
        `
          UPDATE cards
          SET status = $3,
              updated_at = now()
          WHERE tenant_id = $1 AND id = $2
        `,
        [input.tenantId, existing.rows[0].id, input.status]
      );
      await this.upsertPublicDirectory(tx, {
        tenantId: input.tenantId,
        cardId: String(existing.rows[0].id),
        publicId: existing.rows[0].public_id,
        status: input.status
      });
      return existing.rows[0];
    }

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
        VALUES ($1, $2, $3, 'primary', $4, $5, $6, $7, now(), now())
        RETURNING id, public_id
      `,
      [
        input.tenantId,
        input.memberIdentityId,
        publicId,
        defaultEmployeeCardSlug(input),
        input.displayName,
        JSON.stringify({ show_mobile: false, show_email: true, show_wechat: false }),
        input.status
      ]
    );
    const card = requireCardRow(inserted.rows[0]);
    await this.upsertPublicDirectory(tx, {
      tenantId: input.tenantId,
      cardId: String(card.id),
      publicId: card.public_id,
      status: input.status
    });
    return card;
  }

  private async upsertPublicDirectory(
    tx: TenantTransactionClient,
    input: {
      tenantId: string;
      cardId: string;
      publicId: string;
      status: "active" | "disabled";
    }
  ): Promise<void> {
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
        VALUES ($1, $2, $3, $4, now(), now(), now())
        ON CONFLICT (public_id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          card_id = EXCLUDED.card_id,
          status = EXCLUDED.status,
          card_updated_at = now(),
          updated_at = now()
      `,
      [input.publicId, input.tenantId, input.cardId, input.status]
    );
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function normalizeUser(user: SyncWecomContactUser): SyncWecomContactUser {
  return {
    userid: normalizeOptionalString(user.userid),
    openUserid: normalizeOptionalString(user.openUserid),
    name: normalizeOptionalString(user.name),
    departmentIds: user.departmentIds.map(String).filter(Boolean),
    status: user.status
  };
}

function normalizeOptionalString(value: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function requireMemberRow(row: MemberIdentityRow | undefined): MemberIdentityRow {
  if (!row) {
    throw new Error("failed to upsert WeCom contact member");
  }
  return row;
}

function requireCardRow(row: CardRow | undefined): CardRow {
  if (!row) {
    throw new Error("failed to create WeCom contact member card");
  }
  return row;
}
