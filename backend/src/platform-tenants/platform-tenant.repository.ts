import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";

export interface PlatformTenantListRecord {
  tenantId: string;
  name: string;
  creationSource: "local" | "wecom";
  openCorpid: string | null;
  authStatus: string;
  status: "active" | "disabled";
  memberLimit: number | null;
  agentId: string | null;
  authorizedAt: Date | null;
  updatedAt: Date;
  memberCount: number;
  activeMemberCount: number;
  cardCount: number;
  activeCardCount: number;
  permanentCodeConfigured: boolean;
}

export interface PlatformTenantDetailRecord extends PlatformTenantListRecord {
  authScope: unknown;
  permanentCodeConfigured: boolean;
  corpTokenCached: boolean;
  corpTokenExpiresAt: Date | null;
  cancelAuthTime: Date | null;
  adminCount: number;
  activeAdminCount: number;
  admins: PlatformTenantAdminRecord[];
  lastCallback: {
    eventType: string;
    changeType: string | null;
    status: string;
    receivedAt: Date;
    processedAt: Date | null;
    retryCount: number;
    lastError: string | null;
  } | null;
}

export interface PlatformTenantAdminRecord {
  adminId: string;
  memberId: string | null;
  name: string | null;
  openUserid: string;
  role: "owner" | "admin" | "operator" | "auditor";
  status: string;
  authSource: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TenantListRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  tenant_name: string;
  creation_source: "local" | "wecom";
  open_corpid: string | null;
  auth_status: string;
  tenant_status: "active" | "disabled";
  member_limit: number | null;
  agent_id: string | null;
  authorized_at: Date | string | null;
  updated_at: Date | string;
  member_count: string | number | bigint;
  active_member_count: string | number | bigint;
  card_count: string | number | bigint;
  active_card_count: string | number | bigint;
  permanent_code_configured: boolean;
  total_count?: string | number | bigint;
}

interface TenantSummaryRow extends QueryResultRow {
  local_count: string | number | bigint;
  active_count: string | number | bigint;
  cancelled_count: string | number | bigint;
  unhealthy_count: string | number | bigint;
}

interface TenantDetailRow extends TenantListRow {
  auth_scope_json: unknown;
  permanent_code_configured: boolean;
  corp_token_cached: boolean;
  corp_access_token_expires_at: Date | string | null;
  cancel_auth_time: Date | string | null;
  admin_count: string | number | bigint;
  active_admin_count: string | number | bigint;
  callback_event_type: string | null;
  callback_change_type: string | null;
  callback_status: string | null;
  callback_received_at: Date | string | null;
  callback_processed_at: Date | string | null;
  callback_retry_count: number | null;
  callback_last_error: string | null;
}

interface TenantAdminRow extends QueryResultRow {
  admin_id: string | number | bigint;
  member_identity_id: string | number | bigint | null;
  member_name: string | null;
  open_userid: string;
  role: "owner" | "admin" | "operator" | "auditor";
  status: string;
  auth_source: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class PlatformTenantRepository {
  constructor(private readonly database: DatabaseService) {}

  async list(input: {
    search: string;
    status: string;
    limit: number;
    offset: number;
  }): Promise<{ items: PlatformTenantListRecord[]; total: number }> {
    const result = await this.database.query<TenantListRow>(
      `
        SELECT
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.creation_source,
          t.open_corpid,
          t.auth_status,
          t.status AS tenant_status,
          t.member_limit,
          t.agent_id,
          t.authorized_at,
          t.updated_at,
          (t.permanent_code_encrypted IS NOT NULL) AS permanent_code_configured,
          (SELECT count(*) FROM member_identities m WHERE m.tenant_id = t.id) AS member_count,
          (SELECT count(*) FROM member_identities m WHERE m.tenant_id = t.id AND m.status = 'active') AS active_member_count,
          (SELECT count(*) FROM cards c WHERE c.tenant_id = t.id) AS card_count,
          (SELECT count(*) FROM cards c WHERE c.tenant_id = t.id AND c.status = 'active') AS active_card_count,
          count(*) OVER() AS total_count
        FROM tenants t
        WHERE t.tenant_type = 'enterprise'
          AND t.deleted_at IS NULL
          AND ($1 = '' OR t.name ILIKE '%' || $1 || '%' OR COALESCE(t.open_corpid, '') ILIKE '%' || $1 || '%')
          AND ($2 = 'all' OR t.auth_status = $2)
        ORDER BY t.authorized_at DESC NULLS LAST, t.id DESC
        LIMIT $3 OFFSET $4
      `,
      [input.search, input.status, input.limit, input.offset]
    );
    return {
      items: result.rows.map((row) => this.toListRecord(row)),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async summary(): Promise<{ localCount: number; activeCount: number; cancelledCount: number; unhealthyCount: number }> {
    const result = await this.database.query<TenantSummaryRow>(
      `
        SELECT
          count(*) FILTER (WHERE creation_source = 'local') AS local_count,
          count(*) FILTER (WHERE creation_source = 'wecom' AND auth_status = 'active') AS active_count,
          count(*) FILTER (WHERE creation_source = 'wecom' AND auth_status IN ('changed','cancelled')) AS cancelled_count,
          count(*) FILTER (
            WHERE creation_source = 'wecom' AND (auth_status <> 'active' OR permanent_code_encrypted IS NULL)
          ) AS unhealthy_count
        FROM tenants
        WHERE tenant_type = 'enterprise'
          AND deleted_at IS NULL
      `
    );
    const row = result.rows[0];
    return {
      localCount: Number(row?.local_count ?? 0),
      activeCount: Number(row?.active_count ?? 0),
      cancelledCount: Number(row?.cancelled_count ?? 0),
      unhealthyCount: Number(row?.unhealthy_count ?? 0)
    };
  }

  async getById(tenantId: string): Promise<PlatformTenantDetailRecord | null> {
    const result = await this.database.query<TenantDetailRow>(
      `
        SELECT
          t.id AS tenant_id,
          t.name AS tenant_name,
          t.creation_source,
          t.open_corpid,
          t.auth_status,
          t.status AS tenant_status,
          t.member_limit,
          t.agent_id,
          t.auth_scope_json,
          t.authorized_at,
          t.cancel_auth_time,
          t.updated_at,
          (t.permanent_code_encrypted IS NOT NULL) AS permanent_code_configured,
          (t.corp_access_token_encrypted IS NOT NULL) AS corp_token_cached,
          t.corp_access_token_expires_at,
          (SELECT count(*) FROM member_identities m WHERE m.tenant_id = t.id) AS member_count,
          (SELECT count(*) FROM member_identities m WHERE m.tenant_id = t.id AND m.status = 'active') AS active_member_count,
          (SELECT count(*) FROM cards c WHERE c.tenant_id = t.id) AS card_count,
          (SELECT count(*) FROM cards c WHERE c.tenant_id = t.id AND c.status = 'active') AS active_card_count,
          (SELECT count(*) FROM tenant_admins a WHERE a.tenant_id = t.id) AS admin_count,
          (SELECT count(*) FROM tenant_admins a WHERE a.tenant_id = t.id AND a.status = 'active') AS active_admin_count,
          callback.event_type AS callback_event_type,
          callback.change_type AS callback_change_type,
          callback.status AS callback_status,
          callback.received_at AS callback_received_at,
          callback.processed_at AS callback_processed_at,
          callback.retry_count AS callback_retry_count,
          callback.last_error AS callback_last_error
        FROM tenants t
        LEFT JOIN LATERAL (
          SELECT event_type, change_type, status, received_at, processed_at, retry_count, last_error
          FROM callback_events
          WHERE tenant_id = t.id
          ORDER BY received_at DESC, id DESC
          LIMIT 1
        ) callback ON true
        WHERE t.id = $1 AND t.tenant_type = 'enterprise' AND t.deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const admins = await this.listAdmins(tenantId);
    return {
      ...this.toListRecord(row),
      authScope: row.auth_scope_json ?? null,
      permanentCodeConfigured: row.permanent_code_configured,
      corpTokenCached: row.corp_token_cached,
      corpTokenExpiresAt: row.corp_access_token_expires_at ? new Date(row.corp_access_token_expires_at) : null,
      cancelAuthTime: row.cancel_auth_time ? new Date(row.cancel_auth_time) : null,
      adminCount: Number(row.admin_count),
      activeAdminCount: Number(row.active_admin_count),
      admins,
      lastCallback: row.callback_event_type && row.callback_status && row.callback_received_at
        ? {
            eventType: row.callback_event_type,
            changeType: row.callback_change_type,
            status: row.callback_status,
            receivedAt: new Date(row.callback_received_at),
            processedAt: row.callback_processed_at ? new Date(row.callback_processed_at) : null,
            retryCount: Number(row.callback_retry_count ?? 0),
            lastError: row.callback_last_error
          }
        : null
    };
  }

  private async listAdmins(tenantId: string): Promise<PlatformTenantAdminRecord[]> {
    const result = await this.database.query<TenantAdminRow>(
      `
        SELECT
          a.id AS admin_id,
          a.member_identity_id,
          m.name AS member_name,
          a.open_userid,
          a.role,
          a.status,
          a.auth_source,
          a.created_at,
          a.updated_at
        FROM tenant_admins a
        LEFT JOIN member_identities m ON m.tenant_id = a.tenant_id AND m.id = a.member_identity_id
        WHERE a.tenant_id = $1
        ORDER BY
          CASE a.status WHEN 'active' THEN 0 ELSE 1 END,
          CASE a.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'operator' THEN 2 ELSE 3 END,
          a.created_at DESC,
          a.id DESC
        LIMIT 100
      `,
      [tenantId]
    );
    return result.rows.map((row) => ({
      adminId: String(row.admin_id),
      memberId: row.member_identity_id === null || row.member_identity_id === undefined ? null : String(row.member_identity_id),
      name: row.member_name,
      openUserid: row.open_userid,
      role: row.role,
      status: row.status,
      authSource: row.auth_source,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  private toListRecord(row: TenantListRow): PlatformTenantListRecord {
    return {
      tenantId: String(row.tenant_id),
      name: row.tenant_name,
      creationSource: row.creation_source,
      openCorpid: row.open_corpid,
      authStatus: row.auth_status,
      status: row.tenant_status === "disabled" ? "disabled" : "active",
      memberLimit: row.member_limit === null || row.member_limit === undefined ? null : Number(row.member_limit),
      agentId: row.agent_id,
      authorizedAt: row.authorized_at ? new Date(row.authorized_at) : null,
      updatedAt: new Date(row.updated_at),
      memberCount: Number(row.member_count),
      activeMemberCount: Number(row.active_member_count),
      cardCount: Number(row.card_count),
      activeCardCount: Number(row.active_card_count),
      permanentCodeConfigured: row.permanent_code_configured === true
    };
  }

  // Fetch a writable local enterprise (creation_source='local', not soft-deleted).
  // Returns null for missing rows, WeCom/personal tenants, or already-deleted ones,
  // so the service can fail closed before mutating platform-managed state.
  async getLocalWritable(tenantId: string): Promise<{ tenantId: string; name: string; status: "active" | "disabled"; activeOwnerCount: number } | null> {
    if (!/^\d+$/.test(tenantId)) {
      return null;
    }
    const result = await this.database.query<{ id: string | number | bigint; name: string; status: string; active_owner_count: string | number | bigint }>(
      `
        SELECT
          t.id,
          t.name,
          t.status,
          (SELECT count(*) FROM tenant_admins a WHERE a.tenant_id = t.id AND a.role = 'owner' AND a.status = 'active') AS active_owner_count
        FROM tenants t
        WHERE t.id = $1
          AND t.tenant_type = 'enterprise'
          AND t.creation_source = 'local'
          AND t.deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId]
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      tenantId: String(row.id),
      name: row.name,
      status: row.status === "disabled" ? "disabled" : "active",
      activeOwnerCount: Number(row.active_owner_count)
    };
  }

  async createLocalTenant(input: { name: string; memberLimit: number | null }): Promise<{ tenantId: string; name: string }> {
    const result = await this.database.query<{ id: string | number | bigint; name: string }>(
      `
        INSERT INTO tenants (name, tenant_type, creation_source, auth_status, status, member_limit, created_at, updated_at)
        VALUES ($1, 'enterprise', 'local', 'unconnected', 'active', $2, now(), now())
        RETURNING id, name
      `,
      [input.name, input.memberLimit]
    );
    const row = result.rows[0]!;
    return { tenantId: String(row.id), name: row.name };
  }

  async renameLocalTenant(tenantId: string, name: string): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE tenants
        SET name = $2, updated_at = now()
        WHERE id = $1 AND tenant_type = 'enterprise' AND creation_source = 'local' AND deleted_at IS NULL
      `,
      [tenantId, name]
    );
    return result.rowCount === 1;
  }

  async setLocalTenantStatus(tenantId: string, status: "active" | "disabled"): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE tenants
        SET status = $2, updated_at = now()
        WHERE id = $1 AND tenant_type = 'enterprise' AND creation_source = 'local' AND deleted_at IS NULL
      `,
      [tenantId, status]
    );
    return result.rowCount === 1;
  }

  async softDeleteLocalTenant(tenantId: string): Promise<boolean> {
    const result = await this.database.query(
      `
        UPDATE tenants
        SET deleted_at = now(), status = 'disabled', updated_at = now()
        WHERE id = $1 AND tenant_type = 'enterprise' AND creation_source = 'local' AND deleted_at IS NULL
      `,
      [tenantId]
    );
    return result.rowCount === 1;
  }
}
