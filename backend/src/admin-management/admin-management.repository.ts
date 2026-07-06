import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import type { EmployeeSession } from "../session/employee-session.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type {
  AdminMemberCardResponse,
  AdminMemberListResponse,
  AdminOverviewResponse,
  AdminSyncEventListResponse,
  UpdateAdminMemberCardRequest
} from "../contracts/admin-management.js";
import { WecomStateCipherService } from "../wecom/wecom-state-cipher.service.js";

interface OverviewRow extends QueryResultRow {
  member_count: string;
  card_count: string;
  active_card_count: string;
}

interface MemberSummaryRow extends QueryResultRow {
  id: string | number | bigint;
  userid: string | null;
  open_userid: string | null;
  name: string;
  status: "active" | "disabled";
  public_id: string | null;
  total_count?: string;
}

interface SyncEventRow extends QueryResultRow {
  id: string | number | bigint;
  source: "command" | "data";
  event_key: string;
  event_type: string;
  change_type: string | null;
  status: "received" | "processing" | "done" | "failed" | "dead";
  retry_count: number;
  received_at: Date | string;
  processed_at: Date | string | null;
  last_error: string | null;
  total_count?: string;
}

interface UpdatedCardStatusRow extends QueryResultRow {
  id: string | number | bigint;
  public_id: string;
}

interface MemberCardRow extends QueryResultRow {
  member_id: string | number | bigint;
  member_name: string;
  member_status: "active" | "disabled";
  card_id: string | number | bigint | null;
  public_id: string | null;
  display_name: string | null;
  title: string | null;
  email_encrypted: string | null;
  phone_encrypted: string | null;
  fields_encrypted: string | null;
  privacy_json: unknown;
  card_status: "active" | "disabled" | null;
}

type CardFields = AdminMemberCardResponse["fields"];
type CardPrivacy = AdminMemberCardResponse["privacy"];

@Injectable()
export class AdminManagementRepository {
  constructor(
    @Optional() private readonly tenantTx?: TenantTx,
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly cipher?: WecomStateCipherService
  ) {}

  async getOverview(session: AdminSession): Promise<AdminOverviewResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    const result = await this.tenantTx!.run(session.tenantId, (tx) =>
      tx.query<OverviewRow>(
        `
          SELECT
            (SELECT count(*)::text FROM member_identities WHERE tenant_id = $1) AS member_count,
            (SELECT count(*)::text FROM cards WHERE tenant_id = $1 AND deleted_at IS NULL) AS card_count,
            (SELECT count(*)::text FROM cards WHERE tenant_id = $1 AND status = 'active' AND deleted_at IS NULL) AS active_card_count
        `,
        [session.tenantId]
      )
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      tenant_id: session.tenantId,
      tenant_name: session.tenantName,
      member_count: Number(row.member_count),
      card_count: Number(row.card_count),
      active_card_count: Number(row.active_card_count)
    };
  }

  async listMembers(session: AdminSession): Promise<AdminMemberListResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    const result = await this.tenantTx!.run(session.tenantId, (tx) =>
      tx.query<MemberSummaryRow>(
        `
          SELECT
            member_identities.id,
            member_identities.userid,
            member_identities.open_userid,
            member_identities.name,
            member_identities.status,
            cards.public_id,
            count(*) OVER()::text AS total_count
          FROM member_identities
          LEFT JOIN LATERAL (
            SELECT public_id
            FROM cards
            WHERE cards.tenant_id = member_identities.tenant_id
              AND cards.member_identity_id = member_identities.id
              AND cards.card_type = 'primary'
              AND cards.deleted_at IS NULL
            ORDER BY cards.id ASC
            LIMIT 1
          ) cards ON true
          WHERE member_identities.tenant_id = $1
          ORDER BY member_identities.id ASC
          LIMIT 200
        `,
        [session.tenantId]
      )
    );
    return {
      items: result.rows.map((row) => ({
        member_identity_id: String(row.id),
        userid: row.userid,
        open_userid: row.open_userid,
        display_name: row.name,
        status: normalizeStatus(row.status),
        public_id:
          row.public_id ??
          defaultEmployeePublicId({
            tenantId: session.tenantId,
            memberIdentityId: String(row.id)
          })
      })),
      total: Number(result.rows[0]?.total_count ?? "0")
    };
  }

  async getMemberSession(session: AdminSession, memberIdentityId: string): Promise<EmployeeSession | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    const result = await this.tenantTx!.run(session.tenantId, (tx) =>
      tx.query<MemberSummaryRow>(
        `
          SELECT
            member_identities.id,
            member_identities.userid,
            member_identities.open_userid,
            member_identities.name,
            member_identities.status,
            cards.public_id
          FROM member_identities
          LEFT JOIN LATERAL (
            SELECT public_id
            FROM cards
            WHERE cards.tenant_id = member_identities.tenant_id
              AND cards.member_identity_id = member_identities.id
              AND cards.card_type = 'primary'
              AND cards.deleted_at IS NULL
            ORDER BY cards.id ASC
            LIMIT 1
          ) cards ON true
          WHERE member_identities.tenant_id = $1 AND member_identities.id = $2
          LIMIT 1
        `,
        [session.tenantId, memberIdentityId]
      )
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      accountId: `admin:${session.openUserid}`,
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      memberIdentityId: String(row.id),
      displayName: row.name,
      openUserid: row.open_userid ?? row.userid ?? `member:${String(row.id)}`,
      status: normalizeStatus(row.status),
      publicId:
        row.public_id ??
        defaultEmployeePublicId({
          tenantId: session.tenantId,
          memberIdentityId: String(row.id)
        })
    };
  }

  async getMemberCard(session: AdminSession, memberIdentityId: string): Promise<AdminMemberCardResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    const result = await this.tenantTx!.run(session.tenantId, (tx) => this.queryMemberCard(tx, session, memberIdentityId));
    const row = result.rows[0];
    return row ? this.toMemberCard(session, row) : null;
  }

  async updateMemberCard(
    session: AdminSession,
    memberIdentityId: string,
    request: UpdateAdminMemberCardRequest
  ): Promise<AdminMemberCardResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const currentResult = await this.queryMemberCard(tx, session, memberIdentityId);
      const current = currentResult.rows[0];
      if (!current) {
        return null;
      }
      const currentCard = this.toMemberCard(session, current);
      const nextFields = mergeFields(currentCard.fields, request.fields);
      const nextPrivacy = mergePrivacy(currentCard.privacy, request.privacy);
      const nextStatus = request.status ?? currentCard.status;
      const nextDisplayName = request.display_name ?? currentCard.display_name;
      const nextTitle = request.title !== undefined ? request.title : currentCard.title;

      await tx.query(
        `
          UPDATE member_identities
          SET name = $3,
              status = $4,
              updated_at = now()
          WHERE tenant_id = $1 AND id = $2
        `,
        [session.tenantId, memberIdentityId, nextDisplayName, nextStatus]
      );

      const fieldsEncrypted = this.encryptJson(nextFields);
      const emailEncrypted = nextFields.email ? this.encrypt(nextFields.email) : null;
      const phoneValue = nextFields.mobile ?? nextFields.phone ?? null;
      const phoneEncrypted = phoneValue ? this.encrypt(phoneValue) : null;
      const privacyJson = JSON.stringify(nextPrivacy);

      let cardId = current.card_id ? String(current.card_id) : null;
      let publicId = current.public_id;
      if (cardId && publicId) {
        await tx.query(
          `
            UPDATE cards
            SET display_name = $3,
                title = $4,
                email_encrypted = $5,
                phone_encrypted = $6,
                fields_encrypted = $7,
                privacy_json = $8,
                status = $9,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
          `,
          [
            session.tenantId,
            cardId,
            nextDisplayName,
            nextTitle,
            emailEncrypted,
            phoneEncrypted,
            fieldsEncrypted,
            privacyJson,
            nextStatus
          ]
        );
      } else {
        publicId = defaultEmployeePublicId({ tenantId: session.tenantId, memberIdentityId });
        const inserted = await tx.query<UpdatedCardStatusRow>(
          `
            INSERT INTO cards (
              tenant_id,
              member_identity_id,
              public_id,
              card_type,
              slug,
              display_name,
              title,
              email_encrypted,
              phone_encrypted,
              fields_encrypted,
              privacy_json,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, 'primary', $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
            RETURNING id, public_id
          `,
          [
            session.tenantId,
            memberIdentityId,
            publicId,
            defaultEmployeeCardSlug({ tenantId: session.tenantId, memberIdentityId }),
            nextDisplayName,
            nextTitle,
            emailEncrypted,
            phoneEncrypted,
            fieldsEncrypted,
            privacyJson,
            nextStatus
          ]
        );
        const card = inserted.rows[0];
        if (!card) {
          throw new Error("failed to create admin member card");
        }
        cardId = String(card.id);
        publicId = card.public_id;
      }

      await this.upsertPublicDirectory(tx, {
        tenantId: session.tenantId,
        cardId,
        publicId,
        status: nextStatus
      });

      const updatedResult = await this.queryMemberCard(tx, session, memberIdentityId);
      const updated = updatedResult.rows[0];
      if (!updated) {
        throw new Error("failed to reload admin member card");
      }
      return this.toMemberCard(session, updated);
    });
  }

  async updateMemberStatus(
    session: AdminSession,
    memberIdentityId: string,
    status: "active" | "disabled"
  ): Promise<boolean | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const member = await tx.query(
        `
          UPDATE member_identities
          SET status = $3,
              updated_at = now()
          WHERE tenant_id = $1 AND id = $2
          RETURNING id
        `,
        [session.tenantId, memberIdentityId, status]
      );
      if (!member.rows[0]) {
        return false;
      }

      const cards = await tx.query<UpdatedCardStatusRow>(
        `
          UPDATE cards
          SET status = $3,
              updated_at = now()
          WHERE tenant_id = $1
            AND member_identity_id = $2
            AND card_type = 'primary'
            AND deleted_at IS NULL
          RETURNING id, public_id
        `,
        [session.tenantId, memberIdentityId, status]
      );
      for (const card of cards.rows) {
        await this.upsertPublicDirectory(tx, {
          tenantId: session.tenantId,
          cardId: String(card.id),
          publicId: card.public_id,
          status
        });
      }
      return true;
    });
  }

  async listSyncEvents(session: AdminSession): Promise<AdminSyncEventListResponse | null> {
    if (!this.hasPlatformDatabase()) {
      return null;
    }
    const result = await this.database!.query<SyncEventRow>(
      `
        SELECT
          id,
          source,
          event_key,
          event_type,
          change_type,
          status,
          retry_count,
          received_at,
          processed_at,
          last_error,
          count(*) OVER()::text AS total_count
        FROM callback_events
        WHERE tenant_id = $1
        ORDER BY received_at DESC, id DESC
        LIMIT 100
      `,
      [session.tenantId]
    );
    return {
      items: result.rows.map((row) => ({
        id: String(row.id),
        source: row.source,
        event_key: row.event_key,
        event_type: row.event_type,
        change_type: row.change_type,
        status: row.status,
        retry_count: Number(row.retry_count),
        received_at: new Date(row.received_at).toISOString(),
        processed_at: row.processed_at ? new Date(row.processed_at).toISOString() : null,
        last_error: row.last_error
      })),
      total: Number(result.rows[0]?.total_count ?? "0")
    };
  }

  isDatabaseConfigured(): boolean {
    return this.hasDatabase();
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  private hasPlatformDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }

  private async queryMemberCard(
    tx: TenantTransactionClient,
    session: AdminSession,
    memberIdentityId: string
  ): Promise<{ rows: MemberCardRow[] }> {
    return tx.query<MemberCardRow>(
      `
        SELECT
          member_identities.id AS member_id,
          member_identities.name AS member_name,
          member_identities.status AS member_status,
          cards.id AS card_id,
          cards.public_id,
          cards.display_name,
          cards.title,
          cards.email_encrypted,
          cards.phone_encrypted,
          cards.fields_encrypted,
          cards.privacy_json,
          cards.status AS card_status
        FROM member_identities
        LEFT JOIN LATERAL (
          SELECT
            id,
            public_id,
            display_name,
            title,
            email_encrypted,
            phone_encrypted,
            fields_encrypted,
            privacy_json,
            status
          FROM cards
          WHERE cards.tenant_id = member_identities.tenant_id
            AND cards.member_identity_id = member_identities.id
            AND cards.card_type = 'primary'
            AND cards.deleted_at IS NULL
          ORDER BY cards.id ASC
          LIMIT 1
        ) cards ON true
        WHERE member_identities.tenant_id = $1 AND member_identities.id = $2
        LIMIT 1
      `,
      [session.tenantId, memberIdentityId]
    );
  }

  private toMemberCard(session: AdminSession, row: MemberCardRow): AdminMemberCardResponse {
    const memberIdentityId = String(row.member_id);
    const publicId =
      row.public_id ??
      defaultEmployeePublicId({
        tenantId: session.tenantId,
        memberIdentityId
      });
    return {
      card_id: row.card_id ? String(row.card_id) : memberIdentityId,
      public_id: publicId,
      display_name: row.display_name ?? row.member_name,
      title: row.title,
      company: session.tenantName,
      avatar_url: null,
      fields: this.readFields(row),
      status: normalizeStatus(row.card_status ?? row.member_status),
      privacy: parsePrivacy(row.privacy_json)
    };
  }

  private readFields(row: MemberCardRow): CardFields {
    const encryptedFields = this.decryptJson(row.fields_encrypted);
    if (encryptedFields) {
      return encryptedFields;
    }
    return {
      mobile: this.decryptOptional(row.phone_encrypted),
      phone: null,
      email: this.decryptOptional(row.email_encrypted),
      wechat_id: null,
      address: null
    };
  }

  private encrypt(value: string): string {
    if (!this.cipher) {
      throw new Error("WeCom state cipher is required for admin member card persistence");
    }
    return this.cipher.encrypt(value);
  }

  private encryptJson(fields: CardFields): string {
    return this.encrypt(JSON.stringify(fields));
  }

  private decryptOptional(value: string | null): string | null {
    if (!value || !this.cipher) {
      return null;
    }
    try {
      return this.cipher.decrypt(value);
    } catch {
      return null;
    }
  }

  private decryptJson(value: string | null): CardFields | null {
    const plaintext = this.decryptOptional(value);
    if (!plaintext) {
      return null;
    }
    try {
      return normalizeFields(JSON.parse(plaintext));
    } catch {
      return null;
    }
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
}

function normalizeStatus(status: string): "active" | "disabled" {
  return status === "active" ? "active" : "disabled";
}

function defaultFields(): CardFields {
  return {
    mobile: null,
    phone: null,
    email: null,
    wechat_id: null,
    address: null
  };
}

function mergeFields(current: CardFields, patch: UpdateAdminMemberCardRequest["fields"]): CardFields {
  if (!patch) {
    return { ...current };
  }
  return {
    mobile: patch.mobile !== undefined ? patch.mobile : current.mobile,
    phone: patch.phone !== undefined ? patch.phone : current.phone ?? null,
    email: patch.email !== undefined ? patch.email : current.email,
    wechat_id: patch.wechat_id !== undefined ? patch.wechat_id : current.wechat_id,
    address: patch.address !== undefined ? patch.address : current.address ?? null
  };
}

function normalizeFields(value: unknown): CardFields {
  if (!value || typeof value !== "object") {
    return defaultFields();
  }
  const record = value as Record<string, unknown>;
  return {
    mobile: nullableString(record.mobile),
    phone: nullableString(record.phone),
    email: nullableString(record.email),
    wechat_id: nullableString(record.wechat_id),
    address: nullableString(record.address)
  };
}

function mergePrivacy(current: CardPrivacy, patch: UpdateAdminMemberCardRequest["privacy"]): CardPrivacy {
  if (!patch) {
    return { ...current };
  }
  return {
    show_mobile: patch.show_mobile !== undefined ? patch.show_mobile : current.show_mobile,
    show_email: patch.show_email !== undefined ? patch.show_email : current.show_email,
    show_wechat: patch.show_wechat !== undefined ? patch.show_wechat : current.show_wechat
  };
}

function parsePrivacy(value: unknown): CardPrivacy {
  const fallback: CardPrivacy = {
    show_mobile: false,
    show_email: true,
    show_wechat: false
  };
  if (!value) {
    return fallback;
  }
  const record = typeof value === "string" ? parseJsonObject(value) : value;
  if (!record || typeof record !== "object") {
    return fallback;
  }
  const privacy = record as Record<string, unknown>;
  return {
    show_mobile: typeof privacy.show_mobile === "boolean" ? privacy.show_mobile : fallback.show_mobile,
    show_email: typeof privacy.show_email === "boolean" ? privacy.show_email : fallback.show_email,
    show_wechat: typeof privacy.show_wechat === "boolean" ? privacy.show_wechat : fallback.show_wechat
  };
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
