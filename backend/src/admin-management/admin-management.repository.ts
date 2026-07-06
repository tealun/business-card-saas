import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { defaultEmployeePublicId } from "../common/default-public-id.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantTx } from "../database/tenant-tx.service.js";
import type { EmployeeSession } from "../session/employee-session.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import type {
  AdminMemberListResponse,
  AdminOverviewResponse,
  AdminSyncEventListResponse
} from "../contracts/admin-management.js";

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
  status: "received" | "processing" | "done" | "failed";
  retry_count: number;
  received_at: Date | string;
  processed_at: Date | string | null;
  last_error: string | null;
  total_count?: string;
}

@Injectable()
export class AdminManagementRepository {
  constructor(
    @Optional() private readonly tenantTx?: TenantTx,
    @Optional() private readonly database?: DatabaseService
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
      publicId:
        row.public_id ??
        defaultEmployeePublicId({
          tenantId: session.tenantId,
          memberIdentityId: String(row.id)
        })
    };
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

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  private hasPlatformDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function normalizeStatus(status: string): "active" | "disabled" {
  return status === "active" ? "active" : "disabled";
}
