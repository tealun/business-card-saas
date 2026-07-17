import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import type {
  AdminOperationLogItem,
  AdminOperationLogListResponse,
  AdminOperationLogQuery,
  PlatformOperationLogItem,
  PlatformOperationLogListResponse,
  PlatformOperationLogQuery
} from "../contracts/admin-operation-log.js";

export interface AdminOperationLogInsert {
  tenantId: string;
  actorAdminId: string | null;
  actorOpenUserid: string | null;
  actorName: string | null;
  actorRole: string;
  accountType: "tenant" | "platform";
  action: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown> | null;
  ip: string | null;
}

interface AdminOperationLogRow extends QueryResultRow {
  log_id: string | number | bigint;
  tenant_id: string | number | bigint;
  tenant_name: string | null;
  actor_name: string | null;
  actor_open_userid: string | null;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail_json: Record<string, unknown> | null;
  ip: string | null;
  created_at: Date | string;
  total_count?: string | number | bigint;
}

@Injectable()
export class AdminOperationLogRepository {
  constructor(@Optional() private readonly database?: DatabaseService) {}

  async insert(entry: AdminOperationLogInsert): Promise<void> {
    if (!this.hasDatabase()) return;
    await this.database!.query(
      `
        INSERT INTO admin_operation_logs (
          tenant_id,
          actor_admin_id,
          actor_open_userid,
          actor_name,
          actor_role,
          account_type,
          action,
          target_type,
          target_id,
          detail_json,
          ip
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
      [
        entry.tenantId,
        entry.actorAdminId,
        entry.actorOpenUserid,
        entry.actorName,
        entry.actorRole,
        entry.accountType,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.detail === null ? null : JSON.stringify(entry.detail),
        entry.ip
      ]
    );
  }

  async listTenantLogs(tenantId: string, query: AdminOperationLogQuery): Promise<AdminOperationLogListResponse> {
    const { items, total } = await this.listRows(query, tenantId);
    return { items: items as AdminOperationLogItem[], total };
  }

  async listPlatformLogs(query: PlatformOperationLogQuery): Promise<PlatformOperationLogListResponse> {
    const { items, total } = await this.listRows(query, null);
    return { items: items as PlatformOperationLogItem[], total };
  }

  private async listRows(
    query: PlatformOperationLogQuery,
    tenantId: string | null
  ): Promise<{ items: (AdminOperationLogItem | PlatformOperationLogItem)[]; total: number }> {
    if (!this.hasDatabase()) return { items: [], total: 0 };
    const filters = operationLogFilters(query, tenantId);
    const result = await this.database!.query<AdminOperationLogRow>(
      `
        SELECT
          l.id AS log_id,
          l.tenant_id,
          t.name AS tenant_name,
          l.actor_name,
          l.actor_open_userid,
          l.actor_role,
          l.action,
          l.target_type,
          l.target_id,
          l.detail_json,
          l.ip,
          l.created_at,
          count(*) OVER() AS total_count
        FROM admin_operation_logs l
        LEFT JOIN tenants t ON t.id = l.tenant_id
        WHERE 1 = 1
          ${filters.whereSql}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT $${filters.limitIndex} OFFSET $${filters.offsetIndex}
      `,
      filters.values
    );
    return {
      items: result.rows.map((row) => toOperationLogItem(row, tenantId === null)),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}

function operationLogFilters(
  query: PlatformOperationLogQuery,
  tenantId: string | null
): { whereSql: string; values: unknown[]; limitIndex: number; offsetIndex: number } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const scopedTenant = tenantId ?? query.tenant_id;
  if (scopedTenant) {
    values.push(scopedTenant);
    conditions.push(`l.tenant_id = $${values.length}`);
  }
  if (query.action) {
    values.push(query.action);
    conditions.push(`l.action = $${values.length}`);
  }
  if (query.hours) {
    values.push(query.hours);
    conditions.push(`l.created_at >= now() - ($${values.length}::int * interval '1 hour')`);
  }
  if (query.search) {
    values.push(`%${escapeLike(query.search)}%`);
    const index = values.length;
    conditions.push(
      `(l.actor_name ILIKE $${index} ESCAPE '\\' OR l.actor_open_userid ILIKE $${index} ESCAPE '\\' OR l.action ILIKE $${index} ESCAPE '\\' OR l.target_type ILIKE $${index} ESCAPE '\\' OR l.target_id ILIKE $${index} ESCAPE '\\')`
    );
  }
  values.push(query.limit);
  const limitIndex = values.length;
  values.push(query.offset);
  const offsetIndex = values.length;
  return { whereSql: conditions.length ? `AND ${conditions.join(" AND ")}` : "", values, limitIndex, offsetIndex };
}

function toOperationLogItem(row: AdminOperationLogRow, includeTenant: boolean): AdminOperationLogItem | PlatformOperationLogItem {
  const item: AdminOperationLogItem = {
    log_id: String(row.log_id),
    actor_name: row.actor_name,
    actor_open_userid: row.actor_open_userid,
    actor_role: row.actor_role,
    action: row.action,
    target_type: row.target_type,
    target_id: row.target_id,
    detail: row.detail_json,
    ip: row.ip,
    created_at: iso(row.created_at)
  };
  if (!includeTenant) return item;
  return { tenant_id: String(row.tenant_id), tenant_name: row.tenant_name, ...item };
}

function iso(value: Date | string): string {
  return new Date(value).toISOString();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
