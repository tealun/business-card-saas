import { Injectable, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { TenantTx } from "../database/tenant-tx.service.js";
import type {
  UpdateWecomTenantSettingsRequest,
  WecomQrCodeSource,
  WecomTenantSettings
} from "../contracts/wecom-tenant-settings.js";

interface WecomTenantSettingsRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  auto_sync_on_auth: boolean;
  auto_create_cards: boolean;
  auto_disable_left_members: boolean;
  allow_employee_privacy_edit: boolean;
  allow_employee_share_edit: boolean;
  allow_employee_wecom_qrcode_upload: boolean;
  qrcode_source: WecomQrCodeSource;
  updated_at: Date | string | null;
}

const defaults = {
  auto_sync_on_auth: true,
  auto_create_cards: true,
  auto_disable_left_members: true,
  allow_employee_privacy_edit: true,
  allow_employee_share_edit: true,
  allow_employee_wecom_qrcode_upload: true,
  qrcode_source: "enterprise_first" as WecomQrCodeSource
};

@Injectable()
export class WecomTenantSettingsRepository {
  private readonly memory = new Map<string, WecomTenantSettings>();

  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  async get(tenantId: string): Promise<WecomTenantSettings> {
    if (!this.hasDatabase()) {
      return this.memory.get(tenantId) ?? this.defaultSettings(tenantId);
    }
    const result = await this.tenantTx!.run(tenantId, (tx) =>
      tx.query<WecomTenantSettingsRow>(
        `
          SELECT
            tenant_id,
            auto_sync_on_auth,
            auto_create_cards,
            auto_disable_left_members,
            allow_employee_privacy_edit,
            allow_employee_share_edit,
            allow_employee_wecom_qrcode_upload,
            qrcode_source,
            updated_at
          FROM tenant_wecom_settings
          WHERE tenant_id = $1
        `,
        [tenantId]
      )
    );
    return rowToSettings(result.rows[0]) ?? this.defaultSettings(tenantId);
  }

  async update(tenantId: string, request: UpdateWecomTenantSettingsRequest): Promise<WecomTenantSettings> {
    const current = await this.get(tenantId);
    const next: WecomTenantSettings = {
      tenant_id: tenantId,
      auto_sync_on_auth: request.auto_sync_on_auth ?? current.auto_sync_on_auth,
      auto_create_cards: request.auto_create_cards ?? current.auto_create_cards,
      auto_disable_left_members: request.auto_disable_left_members ?? current.auto_disable_left_members,
      allow_employee_privacy_edit: request.allow_employee_privacy_edit ?? current.allow_employee_privacy_edit,
      allow_employee_share_edit: request.allow_employee_share_edit ?? current.allow_employee_share_edit,
      allow_employee_wecom_qrcode_upload:
        request.allow_employee_wecom_qrcode_upload ?? current.allow_employee_wecom_qrcode_upload,
      qrcode_source: request.qrcode_source ?? current.qrcode_source,
      updated_at: current.updated_at
    };
    if (!this.hasDatabase()) {
      const updated = { ...next, updated_at: new Date().toISOString() };
      this.memory.set(tenantId, updated);
      return updated;
    }
    const result = await this.tenantTx!.run(tenantId, (tx) =>
      tx.query<WecomTenantSettingsRow>(
        `
          INSERT INTO tenant_wecom_settings (
            tenant_id,
            auto_sync_on_auth,
            auto_create_cards,
            auto_disable_left_members,
            allow_employee_privacy_edit,
            allow_employee_share_edit,
            allow_employee_wecom_qrcode_upload,
            qrcode_source,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
          ON CONFLICT (tenant_id) DO UPDATE SET
            auto_sync_on_auth = EXCLUDED.auto_sync_on_auth,
            auto_create_cards = EXCLUDED.auto_create_cards,
            auto_disable_left_members = EXCLUDED.auto_disable_left_members,
            allow_employee_privacy_edit = EXCLUDED.allow_employee_privacy_edit,
            allow_employee_share_edit = EXCLUDED.allow_employee_share_edit,
            allow_employee_wecom_qrcode_upload = EXCLUDED.allow_employee_wecom_qrcode_upload,
            qrcode_source = EXCLUDED.qrcode_source,
            updated_at = now()
          RETURNING
            tenant_id,
            auto_sync_on_auth,
            auto_create_cards,
            auto_disable_left_members,
            allow_employee_privacy_edit,
            allow_employee_share_edit,
            allow_employee_wecom_qrcode_upload,
            qrcode_source,
            updated_at
        `,
        [
          tenantId,
          next.auto_sync_on_auth,
          next.auto_create_cards,
          next.auto_disable_left_members,
          next.allow_employee_privacy_edit,
          next.allow_employee_share_edit,
          next.allow_employee_wecom_qrcode_upload,
          next.qrcode_source
        ]
      )
    );
    const updated = rowToSettings(result.rows[0]);
    if (!updated) {
      throw new Error("failed to update WeCom tenant settings");
    }
    return updated;
  }

  private defaultSettings(tenantId: string): WecomTenantSettings {
    return {
      tenant_id: tenantId,
      ...defaults,
      updated_at: null
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function rowToSettings(row: WecomTenantSettingsRow | undefined): WecomTenantSettings | null {
  if (!row) {
    return null;
  }
  return {
    tenant_id: String(row.tenant_id),
    auto_sync_on_auth: row.auto_sync_on_auth,
    auto_create_cards: row.auto_create_cards,
    auto_disable_left_members: row.auto_disable_left_members,
    allow_employee_privacy_edit: row.allow_employee_privacy_edit,
    allow_employee_share_edit: row.allow_employee_share_edit,
    allow_employee_wecom_qrcode_upload: row.allow_employee_wecom_qrcode_upload,
    qrcode_source: row.qrcode_source,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}
