import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { VIDEO_FEATURE_KEY, type PlatformVideoFeatureRequest, type TenantVideoFeatureRequest } from "../contracts/company-video-feature.js";

export interface PlatformFeatureRecord {
  enabled: boolean;
  defaultLimitBytes: number;
  updatedAt: Date;
}

export interface TenantFeatureRecord {
  tenantId: string;
  tenantName: string;
  hasOverride: boolean;
  enabled: boolean;
  limitBytes: number | null;
  updatedAt: Date | null;
}

interface PlatformRow extends QueryResultRow {
  enabled: boolean;
  default_limit_bytes: string | number | bigint;
  updated_at: Date | string;
}

interface TenantRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  tenant_name: string;
  has_override?: boolean;
  enabled: boolean | null;
  limit_bytes: string | number | bigint | null;
  updated_at: Date | string | null;
}

@Injectable()
export class CompanyVideoFeatureRepository {
  private platform: PlatformFeatureRecord = { enabled: false, defaultLimitBytes: 524_288_000, updatedAt: new Date(0) };
  private readonly tenants = new Map<string, TenantFeatureRecord>();
  constructor(@Optional() private readonly database?: DatabaseService) {}

  async getPlatform(): Promise<PlatformFeatureRecord> {
    if (!this.hasDatabase()) {
      return { ...this.platform };
    }
    const result = await this.database!.query<PlatformRow>(
      "SELECT enabled, default_limit_bytes, updated_at FROM platform_feature_settings WHERE feature_key = $1",
      [VIDEO_FEATURE_KEY]
    );
    const row = result.rows[0];
    return row
      ? { enabled: row.enabled, defaultLimitBytes: Number(row.default_limit_bytes), updatedAt: new Date(row.updated_at) }
      : { ...this.platform };
  }

  async updatePlatform(input: PlatformVideoFeatureRequest): Promise<PlatformFeatureRecord> {
    if (!this.hasDatabase()) {
      this.platform = { enabled: input.enabled, defaultLimitBytes: input.default_limit_bytes, updatedAt: new Date() };
      return { ...this.platform };
    }
    const result = await this.database!.query<PlatformRow>(
      `
        INSERT INTO platform_feature_settings (feature_key, enabled, default_limit_bytes, updated_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (feature_key) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          default_limit_bytes = EXCLUDED.default_limit_bytes,
          updated_at = now()
        RETURNING enabled, default_limit_bytes, updated_at
      `,
      [VIDEO_FEATURE_KEY, input.enabled, input.default_limit_bytes]
    );
    await this.database!.query(
      "UPDATE tenant_feature_settings SET limit_bytes = $2, updated_at = now() WHERE feature_key = $1 AND limit_bytes > $2",
      [VIDEO_FEATURE_KEY, input.default_limit_bytes]
    );
    const row = result.rows[0]!;
    return { enabled: row.enabled, defaultLimitBytes: Number(row.default_limit_bytes), updatedAt: new Date(row.updated_at) };
  }

  async getTenant(tenantId: string): Promise<TenantFeatureRecord | null> {
    if (!this.hasDatabase()) {
      return this.tenants.get(tenantId) ?? null;
    }
    const result = await this.database!.query<TenantRow>(
      `
        SELECT t.id AS tenant_id, t.name AS tenant_name, f.enabled, f.limit_bytes, f.updated_at
             , (f.tenant_id IS NOT NULL) AS has_override
        FROM tenants t
        LEFT JOIN tenant_feature_settings f
          ON f.tenant_id = t.id AND f.feature_key = $2
        WHERE t.id = $1
        LIMIT 1
      `,
      [tenantId, VIDEO_FEATURE_KEY]
    );
    return this.rowToTenant(result.rows[0]);
  }

  async listTenants(
    search: string,
    limit: number,
    offset: number,
    options: { onlyOverrides?: boolean } = {}
  ): Promise<{ items: TenantFeatureRecord[]; total: number }> {
    if (!this.hasDatabase()) {
      const normalizedSearch = search.trim();
      const values = [...this.tenants.values()].filter((tenant) =>
        (!options.onlyOverrides || tenant.hasOverride)
          && (!normalizedSearch || tenant.tenantName.includes(normalizedSearch) || tenant.tenantId === normalizedSearch)
      );
      return { items: values.slice(offset, offset + limit), total: values.length };
    }
    const result = await this.database!.query<TenantRow & { total_count: string | number | bigint }>(
      `
        SELECT
          t.id AS tenant_id,
          t.name AS tenant_name,
          (f.tenant_id IS NOT NULL) AS has_override,
          f.enabled,
          f.limit_bytes,
          f.updated_at,
          count(*) OVER() AS total_count
        FROM tenants t
        LEFT JOIN tenant_feature_settings f
          ON f.tenant_id = t.id AND f.feature_key = $1
        WHERE ($2 = '' OR t.name ILIKE '%' || $2 || '%' OR t.id::text = $2)
          AND ($5 = false OR f.tenant_id IS NOT NULL)
        ORDER BY t.id
        LIMIT $3 OFFSET $4
      `,
      [VIDEO_FEATURE_KEY, search, limit, offset, Boolean(options.onlyOverrides)]
    );
    return { items: result.rows.map((row) => this.rowToTenant(row)!), total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async updateTenant(tenantId: string, tenantName: string, input: TenantVideoFeatureRequest): Promise<TenantFeatureRecord> {
    if (!this.hasDatabase()) {
      const record = {
        tenantId,
        tenantName,
        hasOverride: true,
        enabled: input.enabled,
        limitBytes: input.limit_bytes,
        updatedAt: new Date()
      };
      this.tenants.set(tenantId, record);
      return record;
    }
    const result = await this.database!.query<TenantRow>(
      `
        INSERT INTO tenant_feature_settings (tenant_id, feature_key, enabled, limit_bytes, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (tenant_id, feature_key) DO UPDATE SET
          enabled = EXCLUDED.enabled,
          limit_bytes = EXCLUDED.limit_bytes,
          updated_at = now()
        RETURNING tenant_id, $5::text AS tenant_name, true AS has_override, enabled, limit_bytes, updated_at
      `,
      [tenantId, VIDEO_FEATURE_KEY, input.enabled, input.limit_bytes, tenantName]
    );
    return this.rowToTenant(result.rows[0])!;
  }

  private rowToTenant(row: TenantRow | undefined): TenantFeatureRecord | null {
    return row
      ? {
          tenantId: String(row.tenant_id),
          tenantName: row.tenant_name,
          hasOverride: row.has_override === true,
          enabled: row.enabled ?? false,
          limitBytes: row.limit_bytes === null ? null : Number(row.limit_bytes),
          updatedAt: row.updated_at ? new Date(row.updated_at) : null
        }
      : null;
  }

  private hasDatabase() {
    return Boolean(this.database && process.env.DATABASE_URL?.trim());
  }
}
