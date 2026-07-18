import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { normalizePlatformAdminRole, type PlatformAdminRole } from "../contracts/admin-auth.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import type {
  AdminEventListResponse,
  AdminEventQuery,
  AdminListQuery,
  PlatformAdminListResponse,
  PlatformAdminSummary,
  TenantAdminListResponse,
  TenantAdminSummary
} from "../contracts/admin-observability.js";

interface TenantAdminRow extends QueryResultRow {
  admin_id: string | number | bigint;
  member_identity_id: string | number | bigint | null;
  display_name: string | null;
  open_userid: string | null;
  userid: string | null;
  role: "owner" | "admin" | "operator" | "auditor";
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string | number | bigint;
}

interface PlatformAdminRow extends QueryResultRow {
  admin_id: string | number | bigint;
  username: string;
  // Raw database value; legacy 'owner' rows are normalized to 'platform_owner'
  // in toPlatformAdminSummary (migrate_v1_14 pending).
  role: string;
  status: string;
  password_updated_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  total_count?: string | number | bigint;
}

interface AdminEventRow extends QueryResultRow {
  event_id: string | number | bigint;
  tenant_id: string | number | bigint | null;
  tenant_name: string | null;
  source: "command" | "data" | "sync";
  event_key: string;
  event_type: string;
  change_type: string | null;
  status: "received" | "processing" | "done" | "failed" | "dead";
  retry_count: number;
  received_at: Date | string;
  processed_at: Date | string | null;
  last_error: string | null;
  total_count?: string | number | bigint;
}

@Injectable()
export class AdminObservabilityRepository {
  constructor(
    @Optional() private readonly tenantTx?: TenantTx,
    @Optional() private readonly database?: DatabaseService
  ) {}

  async listTenantAdmins(session: AdminSession, query: AdminListQuery): Promise<TenantAdminListResponse> {
    if (!this.hasTenantDatabase()) return { items: [], total: 0 };
    const result = await this.tenantTx!.run(session.tenantId, (tx) => {
      const filters = tenantAdminFilters(query);
      return tx.query<TenantAdminRow>(
        `
          SELECT
            a.id AS admin_id,
            a.member_identity_id,
            m.name AS display_name,
            a.open_userid,
            m.userid,
            a.role,
            a.status,
            a.created_at,
            a.updated_at,
            count(*) OVER() AS total_count
          FROM tenant_admins a
          LEFT JOIN member_identities m
            ON m.tenant_id = a.tenant_id AND m.id = a.member_identity_id
          WHERE a.tenant_id = $1
            ${filters.whereSql}
          ORDER BY
            CASE a.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'operator' THEN 3 ELSE 4 END,
            a.created_at ASC,
            a.id ASC
          LIMIT 100
        `,
        [session.tenantId, ...filters.values]
      );
    });
    return {
      items: result.rows.map(toTenantAdminSummary),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async getTenantAdmin(session: AdminSession, adminId: string): Promise<TenantAdminSummary | null> {
    if (!this.hasTenantDatabase()) return null;
    return this.tenantTx!.run(session.tenantId, (tx) => this.findTenantAdmin(tx, session.tenantId, adminId));
  }

  async updateTenantAdminStatus(
    session: AdminSession,
    adminId: string,
    status: "active" | "disabled"
  ): Promise<TenantAdminSummary | null> {
    if (!this.hasTenantDatabase()) return null;
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      // Self-modify and owner-row protection are re-asserted here, atomically with the write, not
      // only in the service's pre-check -- a check-then-act gap would otherwise let a concurrent
      // request slip through between the read and this UPDATE. See 99_71 (A71-P1-6).
      const updated = await tx.query(
        `
          UPDATE tenant_admins
          SET status = $3, updated_at = now()
          WHERE tenant_id = $1 AND id = $2
            AND role <> 'owner'
            AND open_userid IS DISTINCT FROM $4
            AND member_identity_id::text IS DISTINCT FROM $5
          RETURNING id
        `,
        [session.tenantId, adminId, status, session.openUserid, session.memberIdentityId]
      );
      if (!updated.rows[0]) {
        return null;
      }
      return this.findTenantAdmin(tx, session.tenantId, adminId);
    });
  }

  private async findTenantAdmin(
    tx: TenantTransactionClient,
    tenantId: string,
    adminId: string
  ): Promise<TenantAdminSummary | null> {
    const result = await tx.query<TenantAdminRow>(
      `
        SELECT
          a.id AS admin_id,
          a.member_identity_id,
          m.name AS display_name,
          a.open_userid,
          m.userid,
          a.role,
          a.status,
          a.created_at,
          a.updated_at
        FROM tenant_admins a
        LEFT JOIN member_identities m
          ON m.tenant_id = a.tenant_id AND m.id = a.member_identity_id
        WHERE a.tenant_id = $1 AND a.id = $2
        LIMIT 1
      `,
      [tenantId, adminId]
    );
    const row = result.rows[0];
    return row ? toTenantAdminSummary(row) : null;
  }

  async listPlatformAdmins(query: AdminListQuery): Promise<PlatformAdminListResponse> {
    if (!this.hasPlatformDatabase()) return { items: [], total: 0 };
    const filters = platformAdminFilters(query);
    const result = await this.database!.query<PlatformAdminRow>(
      `
        SELECT
          id AS admin_id,
          username,
          role,
          status,
          password_updated_at,
          created_at,
          updated_at,
          count(*) OVER() AS total_count
        FROM platform_admins
        WHERE 1 = 1
          ${filters.whereSql}
        ORDER BY
          CASE role WHEN 'platform_owner' THEN 1 WHEN 'owner' THEN 1 WHEN 'ops' THEN 2 WHEN 'support' THEN 3 WHEN 'finance' THEN 4 WHEN 'engineer' THEN 5 ELSE 6 END,
          username ASC
        LIMIT 100
      `,
      filters.values
    );
    return {
      items: result.rows.map(toPlatformAdminSummary),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async listTenantEvents(session: AdminSession, query: AdminEventQuery): Promise<AdminEventListResponse> {
    return this.listEvents(query, session.tenantId);
  }

  async listPlatformEvents(query: AdminEventQuery): Promise<AdminEventListResponse> {
    return this.listEvents(query, null);
  }

  private async listEvents(query: AdminEventQuery, tenantId: string | null): Promise<AdminEventListResponse> {
    if (!this.hasPlatformDatabase()) return { items: [], total: 0 };
    const filters = adminEventFilters(query, tenantId);
    const result = await this.database!.query<AdminEventRow>(
      `
        SELECT
          e.id AS event_id,
          e.tenant_id,
          t.name AS tenant_name,
          e.source,
          e.event_key,
          e.event_type,
          e.change_type,
          e.status,
          e.retry_count,
          e.received_at,
          e.processed_at,
          e.last_error,
          count(*) OVER() AS total_count
        FROM callback_events e
        LEFT JOIN tenants t ON t.id = e.tenant_id
        WHERE 1 = 1
          ${filters.whereSql}
        ORDER BY e.received_at DESC, e.id DESC
        LIMIT 100
      `,
      filters.values
    );
    const today = await this.eventTodayStats(tenantId);
    return {
      items: result.rows.map((row) => ({
        event_id: String(row.event_id),
        tenant_id: row.tenant_id === null ? null : String(row.tenant_id),
        tenant_name: row.tenant_name,
        source: row.source,
        event_key: row.event_key,
        event_type: row.event_type,
        change_type: row.change_type,
        status: row.status,
        retry_count: Number(row.retry_count),
        received_at: iso(row.received_at),
        processed_at: row.processed_at ? iso(row.processed_at) : null,
        last_error: row.last_error ? row.last_error.slice(0, 240) : null
      })),
      total: Number(result.rows[0]?.total_count ?? 0),
      today
    };
  }

  private async eventTodayStats(tenantId: string | null): Promise<{ received: number; succeeded: number; failed: number; retryable: number }> {
    const values: unknown[] = [];
    let tenantClause = "";
    if (tenantId !== null) {
      values.push(tenantId);
      tenantClause = "AND tenant_id = $1";
    }
    const result = await this.database!.query<{
      received: string | number | bigint;
      succeeded: string | number | bigint;
      failed: string | number | bigint;
      retryable: string | number | bigint;
    }>(
      `
        SELECT
          count(*) AS received,
          count(*) FILTER (WHERE status = 'done') AS succeeded,
          count(*) FILTER (WHERE status IN ('failed', 'dead')) AS failed,
          count(*) FILTER (WHERE status = 'failed' AND retry_count < 5) AS retryable
        FROM callback_events
        WHERE received_at >= now() - interval '24 hours'
          ${tenantClause}
      `,
      values
    );
    const row = result.rows[0];
    return {
      received: Number(row?.received ?? 0),
      succeeded: Number(row?.succeeded ?? 0),
      failed: Number(row?.failed ?? 0),
      retryable: Number(row?.retryable ?? 0)
    };
  }

  async updatePlatformAdminStatus(
    adminId: string,
    status: "active" | "disabled",
    blockedUsernames: string[]
  ): Promise<PlatformAdminListResponse["items"][number] | null> {
    if (!this.hasPlatformDatabase()) return null;
    const result = await this.database!.query<PlatformAdminRow>(
      `
        UPDATE platform_admins
        SET status = $2, updated_at = now()
        WHERE id = $1 AND NOT (username = ANY($3::text[]))
        RETURNING id AS admin_id, username, role, status, password_updated_at, created_at, updated_at
      `,
      [adminId, status, blockedUsernames]
    );
    const row = result.rows[0];
    if (!row) return null;
    return toPlatformAdminSummary(row);
  }

  private hasTenantDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  private hasPlatformDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function toPlatformAdminSummary(row: PlatformAdminRow): PlatformAdminSummary {
  // Reads normalize legacy 'owner' rows to 'platform_owner' so API responses only
  // carry the new enum even before migrate_v1_14 runs; anything else is data
  // corruption and fails loudly instead of being silently re-labelled.
  const role: PlatformAdminRole | null = normalizePlatformAdminRole(row.role);
  if (!role) {
    throw new Error(`platform_admins row ${row.admin_id} has unexpected role '${row.role}'`);
  }
  return {
    admin_id: String(row.admin_id),
    username: row.username,
    role,
    status: row.status,
    password_updated_at: row.password_updated_at ? iso(row.password_updated_at) : null,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at)
  };
}

function toTenantAdminSummary(row: TenantAdminRow): TenantAdminSummary {
  return {
    admin_id: String(row.admin_id),
    member_identity_id: row.member_identity_id === null ? null : String(row.member_identity_id),
    display_name: row.display_name,
    open_userid: row.open_userid,
    userid: row.userid,
    role: row.role,
    status: row.status,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at)
  };
}

function tenantAdminFilters(query: AdminListQuery): { whereSql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (query.status !== "all") {
    values.push(query.status);
    conditions.push(`a.status = $${values.length + 1}`);
  }
  if (query.search) {
    values.push(`%${escapeLike(query.search)}%`);
    const index = values.length + 1;
    conditions.push(
      `(a.open_userid ILIKE $${index} ESCAPE '\\' OR m.name ILIKE $${index} ESCAPE '\\' OR m.userid ILIKE $${index} ESCAPE '\\')`
    );
  }
  return { whereSql: conditions.length ? `AND ${conditions.join(" AND ")}` : "", values };
}

function platformAdminFilters(query: AdminListQuery): { whereSql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (query.status !== "all") {
    values.push(query.status);
    conditions.push(`status = $${values.length}`);
  }
  if (query.search) {
    values.push(`%${escapeLike(query.search)}%`);
    conditions.push(`username ILIKE $${values.length} ESCAPE '\\'`);
  }
  return { whereSql: conditions.length ? `AND ${conditions.join(" AND ")}` : "", values };
}

function adminEventFilters(query: AdminEventQuery, tenantId: string | null): { whereSql: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (tenantId !== null) {
    values.push(tenantId);
    conditions.push(`e.tenant_id = $${values.length}`);
  }
  if (query.status !== "all") {
    values.push(query.status);
    conditions.push(`e.status = $${values.length}`);
  }
  if (query.source !== "all") {
    values.push(query.source);
    conditions.push(`e.source = $${values.length}`);
  }
  if (query.search) {
    values.push(`%${escapeLike(query.search)}%`);
    const index = values.length;
    conditions.push(
      `(e.event_key ILIKE $${index} ESCAPE '\\' OR e.event_type ILIKE $${index} ESCAPE '\\' OR t.name ILIKE $${index} ESCAPE '\\')`
    );
  }
  return { whereSql: conditions.length ? `AND ${conditions.join(" AND ")}` : "", values };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
