import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { randomToken } from "../common/id.js";
import { TenantTx } from "../database/tenant-tx.service.js";
import type {
  AdminCompanyProfile,
  AdminFieldRule,
  AdminTemplate,
  CreateAdminTemplateRequest,
  UpdateAdminCompanyProfileRequest,
  UpdateAdminFieldSettingsRequest,
  UpdateAdminTemplateRequest
} from "../contracts/admin-config.js";

interface FieldSettingsRow extends QueryResultRow {
  fields_json: unknown;
}

interface CompanyProfileRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  display_name: string;
  short_name: string | null;
  logo_url: string | null;
  website_url: string | null;
  address: string | null;
  intro_json: unknown;
  visible: boolean;
  status: "draft" | "published";
}

interface TemplateRow extends QueryResultRow {
  id: string | number | bigint;
  name: string;
  is_default: boolean;
  background_url: string | null;
  logo_url: string | null;
  color_scheme_json: unknown;
  layout_json: unknown;
  status: "active" | "disabled";
}

interface CountRow extends QueryResultRow {
  count: string;
}

@Injectable()
export class AdminConfigRepository {
  private readonly fieldSettings = new Map<string, AdminFieldRule[]>();
  private readonly companyProfiles = new Map<string, AdminCompanyProfile>();
  private readonly templates = new Map<string, AdminTemplate[]>();

  constructor(@Optional() private readonly tenantTx?: TenantTx) {}

  async getFieldSettings(tenantId: string): Promise<AdminFieldRule[]> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, (tx) =>
        tx.query<FieldSettingsRow>(
          `
            SELECT fields_json
            FROM tenant_field_settings
            WHERE tenant_id = $1
          `,
          [tenantId]
        )
      );
      return parseFieldRules(result.rows[0]?.fields_json) ?? defaultFieldRules();
    }

    const current = this.fieldSettings.get(tenantId) ?? defaultFieldRules();
    this.fieldSettings.set(tenantId, cloneFieldRules(current));
    return cloneFieldRules(current);
  }

  async updateFieldSettings(tenantId: string, request: UpdateAdminFieldSettingsRequest): Promise<AdminFieldRule[]> {
    const next = cloneFieldRules(request.fields);
    if (this.hasDatabase()) {
      await this.tenantTx!.run(tenantId, (tx) =>
        tx.query(
          `
            INSERT INTO tenant_field_settings (tenant_id, fields_json, created_at, updated_at)
            VALUES ($1, $2, now(), now())
            ON CONFLICT (tenant_id) DO UPDATE SET
              fields_json = EXCLUDED.fields_json,
              updated_at = now()
          `,
          [tenantId, JSON.stringify(next)]
        )
      );
      return next;
    }

    this.fieldSettings.set(tenantId, next);
    return cloneFieldRules(next);
  }

  async getCompanyProfile(input: { tenantId: string; tenantName: string }): Promise<AdminCompanyProfile> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(input.tenantId, (tx) =>
        tx.query<CompanyProfileRow>(
          `
            SELECT tenant_id, display_name, short_name, logo_url, website_url, address, intro_json, visible, status
            FROM company_profiles
            WHERE tenant_id = $1 AND deleted_at IS NULL
            ORDER BY id ASC
            LIMIT 1
          `,
          [input.tenantId]
        )
      );
      const profile = rowToCompanyProfile(result.rows[0]);
      return profile ?? defaultCompanyProfile(input);
    }

    const current = this.companyProfiles.get(input.tenantId) ?? defaultCompanyProfile(input);
    this.companyProfiles.set(input.tenantId, cloneCompanyProfile(current));
    return cloneCompanyProfile(current);
  }

  async updateCompanyProfile(
    input: { tenantId: string; tenantName: string },
    request: UpdateAdminCompanyProfileRequest
  ): Promise<AdminCompanyProfile> {
    const current = await this.getCompanyProfile(input);
    const next = mergeCompanyProfile(input.tenantId, current, request);
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(input.tenantId, (tx) =>
        tx.query<CompanyProfileRow>(
          `
            INSERT INTO company_profiles (
              tenant_id,
              display_name,
              short_name,
              logo_url,
              website_url,
              address,
              intro_json,
              visible,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
            ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
              display_name = EXCLUDED.display_name,
              short_name = EXCLUDED.short_name,
              logo_url = EXCLUDED.logo_url,
              website_url = EXCLUDED.website_url,
              address = EXCLUDED.address,
              intro_json = EXCLUDED.intro_json,
              visible = EXCLUDED.visible,
              status = EXCLUDED.status,
              updated_at = now()
            RETURNING tenant_id, display_name, short_name, logo_url, website_url, address, intro_json, visible, status
          `,
          [
            input.tenantId,
            next.display_name,
            next.short_name,
            next.logo_url,
            next.website_url,
            next.address,
            JSON.stringify(next.intro_blocks),
            next.visible,
            next.status
          ]
        )
      );
      const saved = rowToCompanyProfile(result.rows[0]);
      if (!saved) {
        throw new Error("failed to save company profile");
      }
      return saved;
    }

    this.companyProfiles.set(input.tenantId, cloneCompanyProfile(next));
    return cloneCompanyProfile(next);
  }

  async listTemplates(tenantId: string): Promise<AdminTemplate[]> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, async (tx) => {
        const existing = await tx.query<TemplateRow>(
          `
            SELECT id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
            FROM templates
            WHERE tenant_id = $1 AND deleted_at IS NULL
            ORDER BY id ASC
          `,
          [tenantId]
        );
        if (existing.rows.length) {
          return existing;
        }
        const template = defaultTemplate();
        return tx.query<TemplateRow>(
          `
            INSERT INTO templates (
              tenant_id,
              name,
              is_default,
              background_url,
              logo_url,
              color_scheme_json,
              layout_json,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, true, $3, $4, $5, $6, 'active', now(), now())
            ON CONFLICT (tenant_id) WHERE is_default = true AND deleted_at IS NULL DO UPDATE SET
              updated_at = templates.updated_at
            RETURNING id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
          `,
          [
            tenantId,
            template.name,
            template.background_url,
            template.logo_url,
            JSON.stringify(template.color_scheme),
            JSON.stringify(template.layout)
          ]
        );
      });
      const templates = result.rows.map(rowToTemplate);
      return templates;
    }

    const current = this.templates.get(tenantId) ?? [defaultTemplate()];
    this.templates.set(tenantId, cloneTemplates(current));
    return cloneTemplates(current);
  }

  async createTemplate(tenantId: string, request: CreateAdminTemplateRequest): Promise<AdminTemplate> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, async (tx) => {
        const count = await tx.query<CountRow>(
          "SELECT count(*)::text AS count FROM templates WHERE tenant_id = $1 AND deleted_at IS NULL",
          [tenantId]
        );
        const isDefault = Number(count.rows[0]?.count ?? "0") === 0;
        return tx.query<TemplateRow>(
          `
            INSERT INTO templates (
              tenant_id,
              name,
              is_default,
              background_url,
              logo_url,
              color_scheme_json,
              layout_json,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', now(), now())
            RETURNING id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
          `,
          [
            tenantId,
            request.name,
            isDefault,
            request.background_url ?? null,
            request.logo_url ?? null,
            JSON.stringify(request.color_scheme ?? { primary: "#1677ff", surface: "#ffffff" }),
            JSON.stringify(request.layout ?? { variant: "horizontal-business" })
          ]
        );
      });
      return rowToTemplate(result.rows[0]);
    }

    const current = await this.listTemplates(tenantId);
    const isDefault = current.length === 0;
    const template: AdminTemplate = {
      template_id: randomToken("tpl", 10),
      name: request.name,
      is_default: isDefault,
      background_url: request.background_url ?? null,
      logo_url: request.logo_url ?? null,
      color_scheme: request.color_scheme ?? { primary: "#1677ff", surface: "#ffffff" },
      layout: request.layout ?? { variant: "horizontal-business" },
      status: "active"
    };
    const next = [...current, template];
    this.templates.set(tenantId, cloneTemplates(next));
    return { ...template };
  }

  async updateTemplate(tenantId: string, templateId: string, request: UpdateAdminTemplateRequest): Promise<AdminTemplate> {
    if (this.hasDatabase()) {
      const current = await this.getTemplateRow(tenantId, templateId);
      const result = await this.tenantTx!.run(tenantId, (tx) =>
        tx.query<TemplateRow>(
          `
            UPDATE templates
            SET name = $3,
                background_url = $4,
                logo_url = $5,
                color_scheme_json = $6,
                layout_json = $7,
                status = $8,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
            RETURNING id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
          `,
          [
            tenantId,
            templateId,
            request.name ?? current.name,
            request.background_url !== undefined ? request.background_url : current.background_url,
            request.logo_url !== undefined ? request.logo_url : current.logo_url,
            JSON.stringify(request.color_scheme ?? normalizeRecord(current.color_scheme_json)),
            JSON.stringify(request.layout ?? normalizeRecord(current.layout_json)),
            request.status ?? current.status
          ]
        )
      );
      return rowToTemplate(result.rows[0]);
    }

    const current = await this.listTemplates(tenantId);
    const index = current.findIndex((template) => template.template_id === templateId);
    if (index < 0) {
      throw new NotFoundException("template not found");
    }
    const existing = current[index]!;
    const updated: AdminTemplate = {
      template_id: existing.template_id,
      name: request.name ?? existing.name,
      is_default: existing.is_default,
      background_url: request.background_url !== undefined ? request.background_url : existing.background_url,
      logo_url: request.logo_url !== undefined ? request.logo_url : existing.logo_url,
      color_scheme: request.color_scheme ?? existing.color_scheme,
      layout: request.layout ?? existing.layout,
      status: request.status ?? existing.status
    };
    current[index] = updated;
    this.templates.set(tenantId, cloneTemplates(current));
    return { ...updated };
  }

  async setDefaultTemplate(tenantId: string, templateId: string): Promise<AdminTemplate> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, async (tx) => {
        const target = await tx.query<TemplateRow>(
          `
            SELECT id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
            FROM templates
            WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
            LIMIT 1
          `,
          [tenantId, templateId]
        );
        if (!target.rows[0]) {
          throw new NotFoundException("template not found");
        }
        await tx.query(
          "UPDATE templates SET is_default = false, updated_at = now() WHERE tenant_id = $1 AND deleted_at IS NULL",
          [tenantId]
        );
        return tx.query<TemplateRow>(
          `
            UPDATE templates
            SET is_default = true, updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
            RETURNING id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
          `,
          [tenantId, templateId]
        );
      });
      return rowToTemplate(result.rows[0]);
    }

    const current = await this.listTemplates(tenantId);
    const target = current.find((template) => template.template_id === templateId);
    if (!target) {
      throw new NotFoundException("template not found");
    }
    const next = current.map((template) => ({
      ...template,
      is_default: template.template_id === templateId
    }));
    this.templates.set(tenantId, cloneTemplates(next));
    return { ...next.find((template) => template.template_id === templateId)! };
  }

  private async getTemplateRow(tenantId: string, templateId: string): Promise<TemplateRow> {
    const result = await this.tenantTx!.run(tenantId, (tx) =>
      tx.query<TemplateRow>(
        `
          SELECT id, name, is_default, background_url, logo_url, color_scheme_json, layout_json, status
          FROM templates
          WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
          LIMIT 1
        `,
        [tenantId, templateId]
      )
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException("template not found");
    }
    return row;
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function defaultFieldRules(): AdminFieldRule[] {
  return [
    { field_key: "display_name", label: "姓名", locked: false, employee_editable: true, default_visible: true },
    { field_key: "title", label: "职位", locked: false, employee_editable: true, default_visible: true },
    { field_key: "mobile", label: "手机", locked: false, employee_editable: true, default_visible: false },
    { field_key: "phone", label: "座机", locked: false, employee_editable: true, default_visible: true },
    { field_key: "email", label: "邮箱", locked: false, employee_editable: true, default_visible: true },
    { field_key: "wechat_id", label: "微信", locked: false, employee_editable: true, default_visible: false },
    { field_key: "address", label: "地址", locked: false, employee_editable: true, default_visible: true }
  ];
}

function defaultCompanyProfile(input: { tenantId: string; tenantName: string }): AdminCompanyProfile {
  return {
    tenant_id: input.tenantId,
    display_name: input.tenantName,
    short_name: null,
    logo_url: null,
    website_url: null,
    address: null,
    intro_blocks: [],
    visible: true,
    status: "draft"
  };
}

function defaultTemplate(): AdminTemplate {
  return {
    template_id: "tpl_demo_business",
    name: "默认商务模板",
    is_default: true,
    background_url: null,
    logo_url: null,
    color_scheme: { primary: "#1677ff", surface: "#ffffff" },
    layout: { variant: "horizontal-business" },
    status: "active"
  };
}

function parseFieldRules(value: unknown): AdminFieldRule[] | null {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) {
    return null;
  }
  return cloneFieldRules(parsed as AdminFieldRule[]);
}

function rowToCompanyProfile(row: CompanyProfileRow | undefined): AdminCompanyProfile | null {
  if (!row) {
    return null;
  }
  const introBlocks = parseJsonValue(row.intro_json);
  return {
    tenant_id: String(row.tenant_id),
    display_name: row.display_name,
    short_name: row.short_name,
    logo_url: row.logo_url,
    website_url: row.website_url,
    address: row.address,
    intro_blocks: Array.isArray(introBlocks) ? (introBlocks as Record<string, unknown>[]) : [],
    visible: row.visible,
    status: row.status
  };
}

function mergeCompanyProfile(
  tenantId: string,
  current: AdminCompanyProfile,
  request: UpdateAdminCompanyProfileRequest
): AdminCompanyProfile {
  return {
    tenant_id: tenantId,
    display_name: request.display_name ?? current.display_name,
    short_name: request.short_name !== undefined ? request.short_name : current.short_name,
    logo_url: request.logo_url !== undefined ? request.logo_url : current.logo_url,
    website_url: request.website_url !== undefined ? request.website_url : current.website_url,
    address: request.address !== undefined ? request.address : current.address,
    intro_blocks: request.intro_blocks ?? current.intro_blocks,
    visible: request.visible ?? current.visible,
    status: request.status ?? current.status
  };
}

function rowToTemplate(row: TemplateRow | undefined): AdminTemplate {
  if (!row) {
    throw new Error("template row missing");
  }
  return {
    template_id: String(row.id),
    name: row.name,
    is_default: row.is_default,
    background_url: row.background_url,
    logo_url: row.logo_url,
    color_scheme: normalizeRecord(row.color_scheme_json),
    layout: normalizeRecord(row.layout_json),
    status: row.status
  };
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  const parsed = parseJsonValue(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {};
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function cloneFieldRules(rules: AdminFieldRule[]): AdminFieldRule[] {
  return rules.map((rule) => ({ ...rule }));
}

function cloneCompanyProfile(profile: AdminCompanyProfile): AdminCompanyProfile {
  return {
    ...profile,
    intro_blocks: profile.intro_blocks.map((block) => ({ ...block }))
  };
}

function cloneTemplates(templates: AdminTemplate[]): AdminTemplate[] {
  return templates.map((template) => ({
    ...template,
    color_scheme: { ...template.color_scheme },
    layout: { ...template.layout }
  }));
}
