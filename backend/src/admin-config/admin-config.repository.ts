import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { randomToken } from "../common/id.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import type {
  AdminCompanyProfile,
  AdminCompanyHonor,
  AdminFieldRule,
  AdminTemplate,
  CreateAdminCompanyHonorRequest,
  CreateAdminTemplateRequest,
  UpdateAdminCompanyProfileRequest,
  UpdateAdminCompanyHonorRequest,
  UpdateAdminFieldSettingsRequest,
  UpdateAdminTemplateRequest
} from "../contracts/admin-config.js";
import { companyDisplayModulesSchema, companyIntroBlockSchema, companyServiceItemSchema } from "../contracts/admin-config.js";

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
  service_items_json: unknown;
  display_modules_json: unknown;
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

interface HonorRow extends QueryResultRow {
  id: string | number | bigint;
  title: string;
  body: string | null;
  sort_order: number;
  visible: boolean;
  status: "draft" | "published";
  image_id: string | number | bigint | null;
  image_url: string | null;
  image_title: string | null;
  image_caption: string | null;
  image_sort_order: number | null;
}

interface CountRow extends QueryResultRow {
  count: string;
}

@Injectable()
export class AdminConfigRepository {
  private readonly fieldSettings = new Map<string, AdminFieldRule[]>();
  private readonly companyProfiles = new Map<string, AdminCompanyProfile>();
  private readonly companyHonors = new Map<string, AdminCompanyHonor[]>();
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
            SELECT tenant_id, display_name, short_name, logo_url, website_url, address, intro_json,
                   service_items_json, display_modules_json, visible, status
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
              service_items_json,
              display_modules_json,
              visible,
              status,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), now())
            ON CONFLICT (tenant_id) WHERE deleted_at IS NULL DO UPDATE SET
              display_name = EXCLUDED.display_name,
              short_name = EXCLUDED.short_name,
              logo_url = EXCLUDED.logo_url,
              website_url = EXCLUDED.website_url,
              address = EXCLUDED.address,
              intro_json = EXCLUDED.intro_json,
              service_items_json = EXCLUDED.service_items_json,
              display_modules_json = EXCLUDED.display_modules_json,
              visible = EXCLUDED.visible,
              status = EXCLUDED.status,
              updated_at = now()
            RETURNING tenant_id, display_name, short_name, logo_url, website_url, address, intro_json,
                      service_items_json, display_modules_json, visible, status
          `,
          [
            input.tenantId,
            next.display_name,
            next.short_name,
            next.logo_url,
            next.website_url,
            next.address,
            JSON.stringify(next.intro_blocks),
            JSON.stringify(next.service_items),
            JSON.stringify(next.display_modules),
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

  async listCompanyHonors(tenantId: string): Promise<AdminCompanyHonor[]> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, (tx) =>
        tx.query<HonorRow>(
          `
            SELECT
              company_honors.id,
              company_honors.title,
              company_honors.body,
              company_honors.sort_order,
              company_honors.visible,
              company_honors.status,
              company_honor_images.id AS image_id,
              company_honor_images.image_url,
              company_honor_images.title AS image_title,
              company_honor_images.caption AS image_caption,
              company_honor_images.sort_order AS image_sort_order
            FROM company_honors
            LEFT JOIN company_honor_images
              ON company_honor_images.tenant_id = company_honors.tenant_id
              AND company_honor_images.honor_id = company_honors.id
              AND company_honor_images.deleted_at IS NULL
            WHERE company_honors.tenant_id = $1
              AND company_honors.deleted_at IS NULL
            ORDER BY company_honors.sort_order ASC, company_honors.id ASC, company_honor_images.sort_order ASC
          `,
          [tenantId]
        )
      );
      return rowsToCompanyHonors(result.rows);
    }

    const current = this.companyHonors.get(tenantId) ?? [];
    this.companyHonors.set(tenantId, cloneCompanyHonors(current));
    return cloneCompanyHonors(current);
  }

  async createCompanyHonor(tenantId: string, request: CreateAdminCompanyHonorRequest): Promise<AdminCompanyHonor> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, async (tx) => {
        const created = await tx.query<{ id: string | number | bigint }>(
          `
            INSERT INTO company_honors (
              tenant_id, title, body, sort_order, visible, status, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, now(), now())
            RETURNING id
          `,
          [
            tenantId,
            request.title,
            request.body ?? null,
            request.sort_order ?? 0,
            request.visible ?? true,
            request.status ?? "draft"
          ]
        );
        const honorId = String(created.rows[0]!.id);
        await this.replaceHonorImages(tx, tenantId, honorId, request.images ?? []);
        return this.getCompanyHonor(tx, tenantId, honorId);
      });
      return result;
    }

    const current = await this.listCompanyHonors(tenantId);
    const honor: AdminCompanyHonor = {
      honor_id: randomToken("honor", 12),
      title: request.title,
      body: request.body ?? null,
      sort_order: request.sort_order ?? (current.length + 1) * 10,
      visible: request.visible ?? true,
      status: request.status ?? "draft",
      images: (request.images ?? []).map((image, index) => ({
        ...image,
        image_id: image.image_id ?? randomToken("himg", 12),
        sort_order: image.sort_order ?? (index + 1) * 10
      }))
    };
    current.push(honor);
    this.companyHonors.set(tenantId, cloneCompanyHonors(current));
    return cloneCompanyHonor(honor);
  }

  async updateCompanyHonor(
    tenantId: string,
    honorId: string,
    request: UpdateAdminCompanyHonorRequest
  ): Promise<AdminCompanyHonor> {
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, async (tx) => {
        const current = await this.getCompanyHonor(tx, tenantId, honorId);
        await tx.query(
          `
            UPDATE company_honors
            SET title = $3,
                body = $4,
                sort_order = $5,
                visible = $6,
                status = $7,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
          `,
          [
            tenantId,
            honorId,
            request.title ?? current.title,
            request.body !== undefined ? request.body : current.body,
            request.sort_order ?? current.sort_order,
            request.visible ?? current.visible,
            request.status ?? current.status
          ]
        );
        if (request.images) {
          await this.replaceHonorImages(tx, tenantId, honorId, request.images);
        }
        return this.getCompanyHonor(tx, tenantId, honorId);
      });
      return result;
    }

    const current = await this.listCompanyHonors(tenantId);
    const index = current.findIndex((honor) => honor.honor_id === honorId);
    if (index < 0) {
      throw new NotFoundException("honor not found");
    }
    const existing = current[index]!;
    const updated: AdminCompanyHonor = {
      honor_id: existing.honor_id,
      title: request.title ?? existing.title,
      body: request.body !== undefined ? request.body : existing.body,
      sort_order: request.sort_order ?? existing.sort_order,
      visible: request.visible ?? existing.visible,
      status: request.status ?? existing.status,
      images: (request.images ?? existing.images).map((image, imageIndex) => ({
        ...image,
        image_id: image.image_id ?? randomToken("himg", 12),
        sort_order: image.sort_order ?? (imageIndex + 1) * 10
      }))
    };
    current[index] = updated;
    this.companyHonors.set(tenantId, cloneCompanyHonors(current));
    return cloneCompanyHonor(updated);
  }

  async deleteCompanyHonor(tenantId: string, honorId: string): Promise<void> {
    if (this.hasDatabase()) {
      await this.tenantTx!.run(tenantId, async (tx) => {
        const result = await tx.query(
          `
            UPDATE company_honors
            SET deleted_at = now(), visible = false, status = 'draft', updated_at = now()
            WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
          `,
          [tenantId, honorId]
        );
        if (result.rowCount === 0) {
          throw new NotFoundException("honor not found");
        }
        await tx.query(
          "UPDATE company_honor_images SET deleted_at = now() WHERE tenant_id = $1 AND honor_id = $2 AND deleted_at IS NULL",
          [tenantId, honorId]
        );
      });
      return;
    }

    const current = await this.listCompanyHonors(tenantId);
    const next = current.filter((honor) => honor.honor_id !== honorId);
    if (next.length === current.length) {
      throw new NotFoundException("honor not found");
    }
    this.companyHonors.set(tenantId, cloneCompanyHonors(next));
  }

  async publishedVideoExists(tenantId: string, videoId: string): Promise<boolean> {
    if (!/^\d+$/.test(videoId)) {
      return false;
    }
    if (this.hasDatabase()) {
      const result = await this.tenantTx!.run(tenantId, (tx) =>
        tx.query<{ exists: boolean }>(
          `
            SELECT EXISTS (
              SELECT 1
              FROM company_videos
              WHERE tenant_id = $1
                AND id = $2
                AND visible = true
                AND status = 'published'
                AND deleted_at IS NULL
            ) AS exists
          `,
          [tenantId, videoId]
        )
      );
      return Boolean(result.rows[0]?.exists);
    }
    return true;
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

  private async getCompanyHonor(
    tx: TenantTransactionClient,
    tenantId: string,
    honorId: string
  ): Promise<AdminCompanyHonor> {
    const result = await tx.query<HonorRow>(
      `
        SELECT
          company_honors.id,
          company_honors.title,
          company_honors.body,
          company_honors.sort_order,
          company_honors.visible,
          company_honors.status,
          company_honor_images.id AS image_id,
          company_honor_images.image_url,
          company_honor_images.title AS image_title,
          company_honor_images.caption AS image_caption,
          company_honor_images.sort_order AS image_sort_order
        FROM company_honors
        LEFT JOIN company_honor_images
          ON company_honor_images.tenant_id = company_honors.tenant_id
          AND company_honor_images.honor_id = company_honors.id
          AND company_honor_images.deleted_at IS NULL
        WHERE company_honors.tenant_id = $1
          AND company_honors.id = $2
          AND company_honors.deleted_at IS NULL
        ORDER BY company_honor_images.sort_order ASC, company_honor_images.id ASC
      `,
      [tenantId, honorId]
    );
    const honor = rowsToCompanyHonors(result.rows)[0];
    if (!honor) {
      throw new NotFoundException("honor not found");
    }
    return honor;
  }

  private async replaceHonorImages(
    tx: TenantTransactionClient,
    tenantId: string,
    honorId: string,
    images: AdminCompanyHonor["images"]
  ): Promise<void> {
    await tx.query(
      "UPDATE company_honor_images SET deleted_at = now() WHERE tenant_id = $1 AND honor_id = $2 AND deleted_at IS NULL",
      [tenantId, honorId]
    );
    for (const [index, image] of images.entries()) {
      await tx.query(
        `
          INSERT INTO company_honor_images (
            tenant_id, honor_id, image_url, title, caption, sort_order, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now())
        `,
        [
          tenantId,
          honorId,
          image.image_url,
          image.title ?? null,
          image.caption ?? null,
          image.sort_order ?? (index + 1) * 10
        ]
      );
    }
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function defaultFieldRules(): AdminFieldRule[] {
  return [
    { field_key: "avatar_url", label: "头像", locked: false, employee_editable: true, default_visible: true },
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
    service_items: [],
    display_modules: defaultDisplayModules(),
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
  const serviceItems = parseJsonValue(row.service_items_json);
  const displayModules = parseJsonValue(row.display_modules_json);
  return {
    tenant_id: String(row.tenant_id),
    display_name: row.display_name,
    short_name: row.short_name,
    logo_url: row.logo_url,
    website_url: row.website_url,
    address: row.address,
    intro_blocks: Array.isArray(introBlocks)
      ? introBlocks.flatMap((block) => {
          const parsed = companyIntroBlockSchema.safeParse(block);
          return parsed.success ? [parsed.data] : [];
        })
      : [],
    service_items: parseAdminServiceItems(serviceItems),
    display_modules: parseAdminDisplayModules(displayModules),
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
    service_items: request.service_items ?? current.service_items,
    display_modules: request.display_modules ?? current.display_modules,
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
    intro_blocks: profile.intro_blocks.map((block) => ({ ...block })),
    service_items: profile.service_items.map((item) => ({ ...item })),
    display_modules: profile.display_modules.map((item) => ({ ...item }))
  };
}

function parseAdminServiceItems(value: unknown): AdminCompanyProfile["service_items"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .flatMap((raw, index) => {
      const record = normalizeRecord(raw);
      const title = typeof record.title === "string" ? record.title.slice(0, 80) : "";
      const description = typeof record.description === "string" ? record.description.slice(0, 300) : "";
      const rawImageUrl = typeof record.image_url === "string" ? record.image_url : null;
      const image_url = rawImageUrl && isHttpUrl(rawImageUrl) ? rawImageUrl : null;
      const parsed = companyServiceItemSchema.safeParse({
        id: typeof record.id === "string" && /^service_[A-Za-z0-9_-]{1,64}$/.test(record.id)
          ? record.id
          : `service_legacy_${index}`,
        title,
        description,
        image_url,
        visible: typeof record.visible === "boolean" ? record.visible : true,
        sort_order: typeof record.sort_order === "number" ? Math.trunc(record.sort_order) : index * 10
      });
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, 30)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function parseAdminDisplayModules(value: unknown): AdminCompanyProfile["display_modules"] {
  const defaults = defaultDisplayModules();
  if (!Array.isArray(value)) {
    return defaults;
  }
  const byKey = new Map<string, Record<string, unknown>>();
  for (const raw of value) {
    const record = normalizeRecord(raw);
    if (typeof record.key === "string" && !byKey.has(record.key)) {
      byKey.set(record.key, record);
    }
  }
  const modules = defaults.map((fallback) => {
    const record = byKey.get(fallback.key);
    return {
      key: fallback.key,
      title: typeof record?.title === "string" && record.title.trim() ? record.title.slice(0, 32) : fallback.title,
      visible: typeof record?.visible === "boolean" ? record.visible : fallback.visible,
      sort_order: typeof record?.sort_order === "number" ? Math.trunc(record.sort_order) : fallback.sort_order,
      layout: ["text", "image", "graphic", "grid", "carousel"].includes(String(record?.layout))
        ? record!.layout
        : fallback.layout
    };
  });
  const parsed = companyDisplayModulesSchema.safeParse(modules);
  return parsed.success ? parsed.data : defaults;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function rowsToCompanyHonors(rows: HonorRow[]): AdminCompanyHonor[] {
  const honors = new Map<string, AdminCompanyHonor>();
  for (const row of rows) {
    const honorId = String(row.id);
    const honor =
      honors.get(honorId) ??
      ({
        honor_id: honorId,
        title: row.title,
        body: row.body,
        sort_order: Number(row.sort_order),
        visible: row.visible,
        status: row.status,
        images: []
      } satisfies AdminCompanyHonor);
    if (row.image_url) {
      honor.images.push({
        image_id: row.image_id ? String(row.image_id) : undefined,
        image_url: row.image_url,
        title: row.image_title,
        caption: row.image_caption,
        sort_order: Number(row.image_sort_order ?? 0)
      });
    }
    honors.set(honorId, honor);
  }
  return [...honors.values()];
}

function cloneCompanyHonor(honor: AdminCompanyHonor): AdminCompanyHonor {
  return {
    ...honor,
    images: honor.images.map((image) => ({ ...image }))
  };
}

function cloneCompanyHonors(honors: AdminCompanyHonor[]): AdminCompanyHonor[] {
  return honors.map(cloneCompanyHonor);
}

function defaultDisplayModules(): AdminCompanyProfile["display_modules"] {
  return [
    { key: "services", title: "产品与服务", visible: true, sort_order: 10, layout: "graphic" },
    { key: "profile", title: "企业简介", visible: true, sort_order: 20, layout: "carousel" },
    { key: "videos", title: "企业视频", visible: false, sort_order: 30, layout: "carousel" },
    { key: "honors", title: "荣誉资质", visible: true, sort_order: 40, layout: "carousel" }
  ];
}

function cloneTemplates(templates: AdminTemplate[]): AdminTemplate[] {
  return templates.map((template) => ({
    ...template,
    color_scheme: { ...template.color_scheme },
    layout: { ...template.layout }
  }));
}
