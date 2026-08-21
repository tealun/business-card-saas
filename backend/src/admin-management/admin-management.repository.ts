import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import type { EmployeeSession } from "../session/employee-session.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type {
  AdminMemberCardResponse,
  AdminMemberListQuery,
  AdminMemberListResponse,
  AdminOverviewResponse,
  AdminSyncEventListResponse,
  UpdateAdminMemberCardRequest
} from "../contracts/admin-management.js";
import { CardFieldCipherService } from "./card-field-cipher.service.js";

interface OverviewRow extends QueryResultRow {
  creation_source: "local" | "wecom" | null;
  open_corpid: string | null;
  auth_status: string | null;
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
  department?: string | null;
  title?: string | null;
  email_encrypted?: string | null;
  phone_encrypted?: string | null;
  fields_encrypted?: string | null;
  card_status?: "active" | "disabled" | null;
  last_visit_at?: Date | string | null;
  total_count?: string;
}

interface SyncEventRow extends QueryResultRow {
  id: string | number | bigint;
  source: "command" | "data" | "sync";
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
  avatar_url: string | null;
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
    @Optional() private readonly cipher?: CardFieldCipherService
  ) {}

  /**
   * 读取租户后台概览。
   *
   * 在租户 RLS 上下文内聚合成员、名片、访客和企业微信授权信息；未配置数据库时返回 null。
   */
  async getOverview(session: AdminSession): Promise<AdminOverviewResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    const result = await this.tenantTx!.run(session.tenantId, (tx) =>
      tx.query<OverviewRow>(
        `
          SELECT
            t.creation_source,
            t.open_corpid,
            t.auth_status,
            (SELECT count(*)::text FROM member_identities WHERE tenant_id = $1) AS member_count,
            (SELECT count(*)::text FROM cards WHERE tenant_id = $1 AND card_type = 'primary' AND deleted_at IS NULL) AS card_count,
            (SELECT count(*)::text FROM cards WHERE tenant_id = $1 AND card_type = 'primary' AND status = 'active' AND deleted_at IS NULL) AS active_card_count
          FROM tenants t
          WHERE t.id = $1
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
      creation_source: row.creation_source ?? null,
      open_corpid: row.open_corpid ?? null,
      auth_status: row.auth_status ?? null,
      wecom_bound: Boolean(row.open_corpid && row.auth_status === "active"),
      member_count: Number(row.member_count),
      card_count: Number(row.card_count),
      active_card_count: Number(row.active_card_count)
    };
  }

  /**
   * 查询租户成员列表。
   *
   * 支持关键词、状态和分页；所有查询都在当前租户事务内执行，防止跨租户读到成员数据。
   */
  async listMembers(session: AdminSession, query: AdminMemberListQuery): Promise<AdminMemberListResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const filters = memberListFilters(session, query);
      const values = [...filters.values, query.limit, query.offset];
      const result = await tx.query<MemberSummaryRow>(
        `
          SELECT
            member_identities.id,
            member_identities.userid,
            member_identities.open_userid,
            member_identities.name,
            member_identities.status,
            cards.public_id,
            cards.title,
            cards.email_encrypted,
            cards.phone_encrypted,
            cards.fields_encrypted,
            cards.status AS card_status,
            (
              SELECT max(card_visits.created_at)
              FROM card_visits
              WHERE card_visits.tenant_id = member_identities.tenant_id
                AND card_visits.member_identity_id = member_identities.id
            ) AS last_visit_at,
            count(*) OVER()::text AS total_count
          FROM member_identities
          LEFT JOIN LATERAL (
            SELECT public_id, title, email_encrypted, phone_encrypted, fields_encrypted, status
            FROM cards
            WHERE cards.tenant_id = member_identities.tenant_id
              AND cards.member_identity_id = member_identities.id
              AND cards.card_type = 'primary'
              AND cards.deleted_at IS NULL
            ORDER BY cards.id ASC
            LIMIT 1
          ) cards ON true
          WHERE ${filters.whereSql}
          ORDER BY member_identities.id ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
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
            }),
          // department lives in the encrypted card fields blob (employee module
          // schema); department_json on member_identities holds raw WeCom
          // department ids which are not displayable names.
          department: this.readCardDepartment(row.fields_encrypted ?? null),
          title: row.title ?? null,
          mobile: this.decryptOptional(row.phone_encrypted ?? null),
          email: this.decryptOptional(row.email_encrypted ?? null),
          card_status: row.card_status ? normalizeStatus(row.card_status) : "none",
          last_visit_at: row.last_visit_at ? new Date(row.last_visit_at).toISOString() : null
        })),
        total: Number(result.rows[0]?.total_count ?? "0")
      };
    });
  }

  /**
   * 把后台成员 id 转换为员工会话。
   *
   * 后台替员工读取或更新名片时需要复用员工侧 repository 契约，因此这里构造受租户限制的
   * EmployeeSession。
   */
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

  /**
   * 读取后台成员名片详情。
   */
  async getMemberCard(session: AdminSession, memberIdentityId: string): Promise<AdminMemberCardResponse | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    const result = await this.tenantTx!.run(session.tenantId, (tx) => this.queryMemberCard(tx, session, memberIdentityId));
    const row = result.rows[0];
    return row ? this.toMemberCard(session, row) : null;
  }

  /**
   * 后台更新成员名片。
   *
   * 在一个 TenantTx 内同时更新 member_identities、cards、public_card_directory 和加密字段，
   * 并重新读取名片作为响应，保证前端看到的是最终持久化结果。
   */
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

  /**
   * 更新成员和主名片状态。
   *
   * 成员状态、cards.status 与 public_card_directory.status 必须同步变化，避免后台列表、
   * 员工端和公开页看到不一致状态。
   */
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

  // 硬删除成员档案及其名片、访问/分发记录和账号绑定；企业微信里仍存在的成员
  // 下次同步会重新建档。绑定了企业管理员账号的成员拒绝删除，防止删掉后台登录身份。
  /**
   * 硬删除成员档案及其关联数据。
   *
   * 删除前拒绝绑定租户管理员的成员；删除访问、分享、账号绑定、名片和成员身份，
   * 企业微信仍存在的成员会在下次同步时重新建档。
   */
  async deleteMember(
    session: AdminSession,
    memberIdentityId: string
  ): Promise<"deleted" | "not_found" | "admin_bound" | null> {
    if (!this.hasDatabase()) {
      return null;
    }
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const member = await tx.query(
        `SELECT id FROM member_identities WHERE tenant_id = $1 AND id = $2`,
        [session.tenantId, memberIdentityId]
      );
      if (!member.rows[0]) {
        return "not_found" as const;
      }
      const adminBound = await tx.query(
        `SELECT id FROM tenant_admins WHERE tenant_id = $1 AND member_identity_id = $2 LIMIT 1`,
        [session.tenantId, memberIdentityId]
      );
      if (adminBound.rows[0]) {
        return "admin_bound" as const;
      }

      const cards = await tx.query<{ id: string | number | bigint }>(
        `SELECT id FROM cards WHERE tenant_id = $1 AND member_identity_id = $2`,
        [session.tenantId, memberIdentityId]
      );
      const cardIds = cards.rows.map((row) => String(row.id));
      if (cardIds.length) {
        await tx.query(`DELETE FROM card_visits WHERE tenant_id = $1 AND card_id = ANY($2::bigint[])`, [
          session.tenantId,
          cardIds
        ]);
        await tx.query(`DELETE FROM card_actions WHERE tenant_id = $1 AND card_id = ANY($2::bigint[])`, [
          session.tenantId,
          cardIds
        ]);
        await tx.query(`DELETE FROM card_shares WHERE tenant_id = $1 AND card_id = ANY($2::bigint[])`, [
          session.tenantId,
          cardIds
        ]);
        await tx.query(`DELETE FROM card_style_overrides WHERE tenant_id = $1 AND card_id = ANY($2::bigint[])`, [
          session.tenantId,
          cardIds
        ]);
        await tx.query(`DELETE FROM public_card_directory WHERE tenant_id = $1 AND card_id = ANY($2::bigint[])`, [
          session.tenantId,
          cardIds
        ]);
        await tx.query(`DELETE FROM cards WHERE tenant_id = $1 AND id = ANY($2::bigint[])`, [
          session.tenantId,
          cardIds
        ]);
      }
      await tx.query(`DELETE FROM account_identity_bindings WHERE tenant_id = $1 AND member_identity_id = $2`, [
        session.tenantId,
        memberIdentityId
      ]);
      await tx.query(`DELETE FROM member_identities WHERE tenant_id = $1 AND id = $2`, [
        session.tenantId,
        memberIdentityId
      ]);
      return "deleted" as const;
    });
  }

  /**
   * 列出平台回调/同步事件。
   *
   * 使用平台级数据库连接读取 callback_events，不走租户 RLS；查询条件仍限制在当前租户 id。
   */
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

  /**
   * 判断租户级数据库能力是否可用。
   */
  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  /**
   * 判断平台级数据库能力是否可用。
   */
  private hasPlatformDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }

  /**
   * 查询单个成员名片的数据库原始行。
   *
   * 同时读取成员、主名片和最近访问时间，后续由 toMemberCard 做字段解密和响应转换。
   */
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
          cards.avatar_url,
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
            avatar_url,
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

  /**
   * 将成员名片数据库行转换为后台响应。
   *
   * 这里会解密字段 JSON、补齐隐私/自助配置，并组装前端可编辑字段列表。
   */
  private toMemberCard(session: AdminSession, row: MemberCardRow): AdminMemberCardResponse {
    const memberIdentityId = String(row.member_id);
    const publicId =
      row.public_id ??
      defaultEmployeePublicId({
        tenantId: session.tenantId,
        memberIdentityId
      });
    return {
      card_id: row.card_id ? String(row.card_id) : null,
      public_id: publicId,
      display_name: row.display_name ?? row.member_name,
      title: row.title,
      company: session.tenantName,
      avatar_url: row.avatar_url,
      fields: this.readFields(row),
      status: normalizeStatus(row.card_status ?? row.member_status),
      privacy: parsePrivacy(row.privacy_json)
    };
  }

  /**
   * 读取名片扩展字段。
   *
   * 优先使用加密 JSON；没有加密字段时回退到旧列，兼容迁移完成前的数据。
   */
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

  /**
   * 加密单个名片字段值。
   *
   * 未配置字段加密服务时返回空字符串，调用方需要避免在这种环境写入敏感字段。
   */
  private encrypt(value: string): string {
    if (!this.cipher) {
      throw new Error("Card field cipher is required for admin member card persistence");
    }
    return this.cipher.encrypt(value);
  }

  /**
   * 加密名片扩展字段 JSON。
   */
  private encryptJson(fields: CardFields): string {
    return this.encrypt(JSON.stringify(fields));
  }

  /**
   * 解密可空字段。
   *
   * 缺少密文或未配置加密服务时返回 null，调用方再决定是否使用兼容回退值。
   */
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

  /**
   * 解密名片扩展字段 JSON。
   *
   * JSON 解析失败时返回 null，避免单个坏字段破坏整个后台成员列表。
   */
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

  /**
   * 从旧版加密字段中读取部门。
   *
   * 用于兼容 fields_encrypted 尚未完全覆盖旧列的过渡数据。
   */
  private readCardDepartment(value: string | null): string | null {
    const plaintext = this.decryptOptional(value);
    if (!plaintext) {
      return null;
    }
    try {
      const record: unknown = JSON.parse(plaintext);
      if (record && typeof record === "object") {
        const department = (record as Record<string, unknown>).department;
        return typeof department === "string" && department.trim() ? department : null;
      }
    } catch {
      // fall through
    }
    return null;
  }

  /**
   * 同步公开名片目录项。
   *
   * 成员名片更新后必须同步 public_card_directory，公开页才能按 public_id 找到最新主名片。
   */
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
}

function normalizeStatus(status: string): "active" | "disabled" {
  return status === "active" ? "active" : "disabled";
}

function memberListFilters(session: AdminSession, query: AdminMemberListQuery): { whereSql: string; values: unknown[] } {
  const conditions = ["member_identities.tenant_id = $1"];
  const values: unknown[] = [session.tenantId];
  if (query.status !== "all") {
    values.push(query.status);
    conditions.push(`member_identities.status = $${values.length}`);
  }
  if (query.search) {
    values.push(`%${escapeLike(query.search)}%`);
    const index = values.length;
    conditions.push(
      `(${[
        `member_identities.name ILIKE $${index} ESCAPE '\\'`,
        `member_identities.userid ILIKE $${index} ESCAPE '\\'`,
        `member_identities.open_userid ILIKE $${index} ESCAPE '\\'`
      ].join(" OR ")})`
    );
  }
  return { whereSql: conditions.join(" AND "), values };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function defaultFields(): CardFields {
  return {
    company: null,
    company_short_name: null,
    department: null,
    mobile: null,
    phone: null,
    email: null,
    wechat_id: null,
    address: null,
    website: null
  };
}

/**
 * 合并后台名片字段 patch。
 *
 * 后台保存常常只提交部分字段；合并时必须保留当前 blob 中其他模块维护的字段，
 * 避免一次局部编辑造成字段丢失。
 */
function mergeFields(current: CardFields, patch: UpdateAdminMemberCardRequest["fields"]): CardFields {
  // 只覆盖本次 patch 明确提交的键，保留其他模块维护的字段（department、company、website 等）。
  const base: Record<string, unknown> = { ...current };
  if (!patch) {
    return base as CardFields;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      base[key] = value;
    }
  }
  return base as CardFields;
}

/**
 * 规范化名片扩展字段。
 *
 * 已知字段转为可空字符串，未知字段原样保留，兼容未来扩展字段和历史数据。
 */
function normalizeFields(value: unknown): CardFields {
  if (!value || typeof value !== "object") {
    return defaultFields();
  }
  const record = value as Record<string, unknown>;
  // 保留共享 blob 中的未知键（例如二维码图片来源），只规范化已知字符串字段。
  return {
    ...record,
    company: nullableString(record.company),
    company_short_name: nullableString(record.company_short_name),
    department: nullableString(record.department),
    mobile: nullableString(record.mobile),
    phone: nullableString(record.phone),
    email: nullableString(record.email),
    wechat_id: nullableString(record.wechat_id),
    address: nullableString(record.address),
    website: nullableString(record.website)
  } as CardFields;
}

function mergePrivacy(current: CardPrivacy, patch: UpdateAdminMemberCardRequest["privacy"]): CardPrivacy {
  if (!patch) {
    return { ...current };
  }
  return {
    show_mobile: patch.show_mobile !== undefined ? patch.show_mobile : current.show_mobile,
    show_email: patch.show_email !== undefined ? patch.show_email : current.show_email,
    show_wechat: patch.show_wechat !== undefined ? patch.show_wechat : current.show_wechat,
    allow_forward: patch.allow_forward !== undefined ? patch.allow_forward : current.allow_forward,
    show_avatar: patch.show_avatar !== undefined ? patch.show_avatar : current.show_avatar,
    share_title: patch.share_title !== undefined ? patch.share_title : current.share_title
  };
}

function parsePrivacy(value: unknown): CardPrivacy {
  const fallback: CardPrivacy = {
    show_mobile: false,
    show_email: true,
    show_wechat: false,
    allow_forward: true,
    show_avatar: true,
    share_title: null
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
    show_wechat: typeof privacy.show_wechat === "boolean" ? privacy.show_wechat : fallback.show_wechat,
    allow_forward: typeof privacy.allow_forward === "boolean" ? privacy.allow_forward : fallback.allow_forward,
    show_avatar: typeof privacy.show_avatar === "boolean" ? privacy.show_avatar : fallback.show_avatar,
    share_title: typeof privacy.share_title === "string" && privacy.share_title.trim() ? privacy.share_title.trim().slice(0, 50) : fallback.share_title
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
