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

export interface DisableWecomContactMemberInput {
  tenantId: string;
  userid: string | null;
  openUserid: string | null;
}

export interface DisableStaleWecomContactMembersInput {
  tenantId: string;
  activeOpenUserids: string[];
  activeUserids: string[];
}

interface MemberIdentityRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
}

interface DisabledMemberRow extends QueryResultRow {
  id: string | number | bigint;
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

  async disableStaleMembers(input: DisableStaleWecomContactMembersInput): Promise<number> {
    if (!this.hasDatabase()) {
      const current = this.memory.get(input.tenantId) ?? [];
      let disabledCount = 0;
      const updated = current.map((user) => {
        if (
          user.status === "active" &&
          ((user.openUserid && !input.activeOpenUserids.includes(user.openUserid)) ||
            (user.userid && !input.activeUserids.includes(user.userid)))
        ) {
          disabledCount += 1;
          return { ...user, status: "disabled" as const };
        }
        return user;
      });
      this.memory.set(input.tenantId, updated);
      return disabledCount;
    }

    return this.tenantTx!.run(input.tenantId, async (tx) => {
      const result = await tx.query<DisabledMemberRow>(
        `
          WITH stale AS (
            SELECT id
            FROM member_identities
            WHERE tenant_id = $1
              AND status = 'active'
              AND (
                (open_userid IS NOT NULL AND NOT (open_userid = ANY($2::text[])))
                OR (userid IS NOT NULL AND NOT (userid = ANY($3::text[])))
              )
          )
          UPDATE member_identities
          SET status = 'disabled',
              updated_at = now()
          WHERE tenant_id = $1 AND id IN (SELECT id FROM stale)
          RETURNING id
        `,
        [input.tenantId, input.activeOpenUserids, input.activeUserids]
      );
      const disabledIds = result.rows.map((row) => String(row.id));
      if (disabledIds.length > 0) {
        await tx.query(
          `
            UPDATE cards
            SET status = 'disabled',
                updated_at = now()
            WHERE tenant_id = $1
              AND member_identity_id = ANY($2::bigint[])
              AND card_type = 'primary'
              AND deleted_at IS NULL
          `,
          [input.tenantId, disabledIds]
        );
      }
      return disabledIds.length;
    });
  }

  async disableMember(input: DisableWecomContactMemberInput): Promise<boolean> {
    const userid = normalizeOptionalString(input.userid);
    const openUserid = normalizeOptionalString(input.openUserid);
    if (!userid && !openUserid) {
      return false;
    }
    if (!this.hasDatabase()) {
      const current = this.memory.get(input.tenantId) ?? [];
      const index = current.findIndex((user) => user.userid === userid || user.openUserid === openUserid);
      if (index < 0) {
        return false;
      }
      current[index] = { ...current[index]!, status: "disabled" };
      this.memory.set(input.tenantId, current);
      return true;
    }

    return this.tenantTx!.run(input.tenantId, async (tx) => {
      const members = await tx.query<MemberIdentityRow>(
        `
          SELECT id, name
          FROM member_identities
          WHERE tenant_id = $1
            AND (
              ($2::text IS NOT NULL AND open_userid = $2)
              OR ($3::text IS NOT NULL AND userid = $3)
            )
        `,
        [input.tenantId, openUserid, userid]
      );
      if (!members.rows.length) {
        return false;
      }
      const memberIds = members.rows.map((row) => String(row.id));
      await tx.query(
        `
          UPDATE member_identities
          SET status = 'disabled',
              updated_at = now()
          WHERE tenant_id = $1 AND id = ANY($2::bigint[])
        `,
        [input.tenantId, memberIds]
      );
      const cards = await tx.query<CardRow>(
        `
          UPDATE cards
          SET status = 'disabled',
              updated_at = now()
          WHERE tenant_id = $1
            AND member_identity_id = ANY($2::bigint[])
            AND card_type = 'primary'
            AND deleted_at IS NULL
          RETURNING id, public_id
        `,
        [input.tenantId, memberIds]
      );
      for (const card of cards.rows) {
        await this.upsertPublicDirectory(tx, {
          tenantId: input.tenantId,
          cardId: String(card.id),
          publicId: card.public_id,
          status: "disabled"
        });
      }
      return true;
    });
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
              name = COALESCE($4, name),
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
          user.name,
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
        JSON.stringify({ show_mobile: false, show_email: true, show_wechat: false, allow_forward: true }),
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
          status = EXCLUDED.status,
          card_updated_at = now(),
          updated_at = now()
        WHERE public_card_directory.tenant_id = EXCLUDED.tenant_id
          AND public_card_directory.card_id = EXCLUDED.card_id
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
