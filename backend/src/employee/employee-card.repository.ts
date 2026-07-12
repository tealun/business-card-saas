import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type {
  EmployeeCardPreviewResponse,
  EmployeeCardResponse,
  EmployeeCardStatsResponse,
  UpdateEmployeeCardRequest,
  UpdateEmployeeCardStyleRequest
} from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { randomToken } from "../common/id.js";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { demoEmployeeCard } from "../fixtures/demo-cards.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import { CardFieldCipherService } from "../admin-management/card-field-cipher.service.js";
import { StorageService } from "../storage/storage.service.js";

type CardFields = EmployeeCardResponse["fields"];
type CardPrivacy = EmployeeCardResponse["privacy"];
type EditableFieldKey =
  | "avatar_url"
  | "display_name"
  | "title"
  | "department"
  | "mobile"
  | "phone"
  | "email"
  | "wechat_id"
  | "address"
  | "website";

interface EmployeeCardRow extends QueryResultRow {
  member_id: string | number | bigint;
  member_name: string;
  member_status: "active" | "disabled";
  card_id: string | number | bigint | null;
  public_id: string | null;
  display_name: string | null;
  title: string | null;
  avatar_url: string | null;
  fields_encrypted: string | null;
  privacy_json: unknown;
  card_status: "active" | "disabled" | null;
}

interface StyleRow extends QueryResultRow {
  background_url: string | null;
  color_scheme_json: unknown;
  layout_json: unknown;
}

@Injectable()
export class EmployeeCardRepository {
  private readonly cards = new Map<string, EmployeeCardResponse>([["1:1", demoEmployeeCard]]);

  private readonly styles = new Map<string, UpdateEmployeeCardStyleRequest>([
    [
      "1:1",
      {
        template_id: "tpl_demo_business",
        color_scheme: {
          primary: "#1677ff",
          surface: "#ffffff"
        },
        layout: {
          variant: "horizontal-business"
        }
      }
    ]
  ]);

  constructor(
    @Optional() private readonly tenantTx?: TenantTx,
    @Optional() private readonly cipher?: CardFieldCipherService,
    @Optional() private readonly storage?: StorageService
  ) {}

  async getCurrentCard(session: EmployeeSession): Promise<EmployeeCardResponse> {
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => {
        const card = await this.ensureCurrentCardInDb(tx, session);
        return this.cloneCard({ ...card, editable_fields: await this.editableFields(tx, session) });
      });
    }
    return this.cloneCard({ ...this.ensureCurrentCardInMemory(session), editable_fields: defaultEditableFields() });
  }

  // Per-identity visit stats: card_visits rows are already scoped to the
  // current identity's tenant + member, so personal and each enterprise card
  // naturally keep separate numbers.
  async getCurrentCardStats(session: EmployeeSession): Promise<EmployeeCardStatsResponse> {
    if (!this.hasDatabase()) {
      return { visitor_count: 0, visit_count: 0, recent_visitors: [] };
    }
    return this.tenantTx!.run(session.tenantId, async (tx) => {
      const totals = await tx.query<{ visit_count: string; visitor_count: string }>(
        `
          SELECT
            count(*)::text AS visit_count,
            count(DISTINCT COALESCE(visitor_account_id::text, anon_id, id::text))::text AS visitor_count
          FROM card_visits
          WHERE tenant_id = $1 AND member_identity_id = $2
        `,
        [session.tenantId, session.memberIdentityId]
      );
      const recent = await tx.query<{
        visitor_key: string;
        has_account: boolean;
        visit_count: string;
        channel: string | null;
        last_visit_at: Date | string;
      }>(
        `
          SELECT
            COALESCE(visitor_account_id::text, anon_id, id::text) AS visitor_key,
            bool_or(visitor_account_id IS NOT NULL) AS has_account,
            count(*)::text AS visit_count,
            (array_agg(channel ORDER BY created_at DESC))[1] AS channel,
            max(created_at) AS last_visit_at
          FROM card_visits
          WHERE tenant_id = $1 AND member_identity_id = $2
          GROUP BY COALESCE(visitor_account_id::text, anon_id, id::text)
          ORDER BY max(created_at) DESC
          LIMIT 10
        `,
        [session.tenantId, session.memberIdentityId]
      );
      return {
        visitor_count: Number(totals.rows[0]?.visitor_count ?? 0),
        visit_count: Number(totals.rows[0]?.visit_count ?? 0),
        recent_visitors: recent.rows.map((row) => ({
          visitor_key: row.visitor_key,
          visitor_label: row.has_account ? "微信访客" : "匿名访客",
          visit_count: Number(row.visit_count),
          channel: row.channel ?? null,
          last_visit_at: new Date(row.last_visit_at).toISOString()
        }))
      };
    });
  }

  async updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): Promise<EmployeeCardResponse> {
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => {
        const current = await this.ensureCurrentCardInDb(tx, session);
        const allowedFields = await this.editableFields(tx, session);
        assertCanUpdate(request, allowedFields);
        const next = mergeCard(current, await this.materializeStorageFields(session, request), allowedFields);
        const encryptedFields = this.encryptJson(next.fields);
        await tx.query(
          `
            UPDATE member_identities
            SET name = $3,
                status = $4,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
          `,
          [session.tenantId, session.memberIdentityId, next.display_name, next.status]
        );
        await tx.query(
          `
            UPDATE cards
            SET display_name = $3,
                title = $4,
                avatar_url = $5,
                fields_encrypted = $6,
                privacy_json = $7::jsonb,
                status = $8,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
          `,
          [
            session.tenantId,
            next.card_id,
            next.display_name,
            next.title,
            next.avatar_url,
            encryptedFields,
            JSON.stringify(next.privacy),
            next.status
          ]
        );
        await this.upsertPublicDirectory(tx, {
          tenantId: session.tenantId,
          cardId: next.card_id,
          publicId: next.public_id,
          status: next.status
        });
        return this.cloneCard(next);
      });
    }

    const key = this.cardKey(session);
    const current = this.ensureCurrentCardInMemory(session);
    const allowedFields = defaultEditableFields();
    assertCanUpdate(request, allowedFields);
    const next = mergeCard(current, await this.materializeStorageFields(session, request), allowedFields);
    this.cards.set(key, next);
    return this.cloneCard(next);
  }

  async updateCurrentCardStatus(
    session: EmployeeSession,
    status: "active" | "disabled"
  ): Promise<EmployeeCardResponse> {
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => {
        const current = await this.ensureCurrentCardInDb(tx, session);
        const next = {
          ...current,
          fields: { ...current.fields },
          privacy: { ...current.privacy },
          status
        };
        await tx.query(
          `
            UPDATE member_identities
            SET status = $3,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
          `,
          [session.tenantId, session.memberIdentityId, status]
        );
        await tx.query(
          `
            UPDATE cards
            SET status = $3,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
          `,
          [session.tenantId, next.card_id, status]
        );
        await this.upsertPublicDirectory(tx, {
          tenantId: session.tenantId,
          cardId: next.card_id,
          publicId: next.public_id,
          status
        });
        return this.cloneCard(next);
      });
    }

    const key = this.cardKey(session);
    const current = this.ensureCurrentCardInMemory(session);
    const next: EmployeeCardResponse = {
      ...current,
      fields: { ...current.fields },
      privacy: { ...current.privacy },
      status
    };
    this.cards.set(key, next);
    return this.cloneCard(next);
  }

  async createShare(session: EmployeeSession): Promise<{ publicId: string; shareId: string }> {
    const card = await this.getCurrentCard(session);
    return {
      publicId: card.public_id,
      shareId: randomToken("shr", 18)
    };
  }

  async getPreview(session: EmployeeSession): Promise<EmployeeCardPreviewResponse> {
    const card = await this.getCurrentCard(session);
    const style = this.hasDatabase()
      ? await this.tenantTx!.run(session.tenantId, async (tx) => this.readStyle(tx, session.tenantId, card.card_id))
      : this.styles.get(this.cardKey(session)) ?? {};
    return this.toPreview(card, style);
  }

  async updateStyle(
    session: EmployeeSession,
    request: UpdateEmployeeCardStyleRequest
  ): Promise<EmployeeCardPreviewResponse> {
    const materializedRequest = await this.materializeStyleStorageFields(session, request);
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => {
        const card = await this.ensureCurrentCardInDb(tx, session);
        const current = await this.readStyle(tx, session.tenantId, card.card_id);
        const next = mergeStyle(current, materializedRequest);
        await this.upsertStyle(tx, session.tenantId, card.card_id, next);
        return this.toPreview(card, next);
      });
    }

    const key = this.cardKey(session);
    const card = this.ensureCurrentCardInMemory(session);
    const current = this.styles.get(key) ?? {};
    const next = mergeStyle(current, materializedRequest);
    this.styles.set(key, next);
    return this.toPreview(card, next);
  }

  private async ensureCurrentCardInDb(
    tx: TenantTransactionClient,
    session: EmployeeSession
  ): Promise<EmployeeCardResponse> {
    const existing = await this.queryCurrentCard(tx, session);
    if (!existing) {
      throw new NotFoundException("employee member not found");
    }
    if (existing.card_id) {
      return this.toCard(session, existing);
    }

    const publicId = session.publicId ?? defaultEmployeePublicId(session);
    const fields = defaultFields();
    const inserted = await tx.query<{ id: string | number | bigint; public_id: string }>(
      `
        INSERT INTO cards (
          tenant_id,
          member_identity_id,
          public_id,
          card_type,
          slug,
          display_name,
          fields_encrypted,
          privacy_json,
          status,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, 'primary', $4, $5, $6, $7::jsonb, $8, now(), now())
        RETURNING id, public_id
      `,
      [
        session.tenantId,
        session.memberIdentityId,
        publicId,
        defaultEmployeeCardSlug(session),
        session.displayName ?? session.openUserid,
        this.encryptJson(fields),
        JSON.stringify(defaultPrivacy()),
        session.status ?? "active"
      ]
    );
    const row = inserted.rows[0];
    if (!row) {
      throw new Error("failed to create employee card");
    }
    await this.upsertPublicDirectory(tx, {
      tenantId: session.tenantId,
      cardId: String(row.id),
      publicId: row.public_id,
      status: session.status ?? "active"
    });
    const created = await this.queryCurrentCard(tx, session);
    if (!created?.card_id) {
      throw new Error("failed to load created employee card");
    }
    return this.toCard(session, created);
  }

  private async queryCurrentCard(
    tx: TenantTransactionClient,
    session: EmployeeSession
  ): Promise<EmployeeCardRow | null> {
    const result = await tx.query<EmployeeCardRow>(
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
          cards.fields_encrypted,
          cards.privacy_json,
          cards.status AS card_status
        FROM member_identities
        LEFT JOIN LATERAL (
          SELECT id, public_id, display_name, title, avatar_url, fields_encrypted, privacy_json, status
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
      [session.tenantId, session.memberIdentityId]
    );
    return result.rows[0] ?? null;
  }

  private toCard(session: EmployeeSession, row: EmployeeCardRow): EmployeeCardResponse {
    const memberIdentityId = String(row.member_id);
    return {
      card_id: row.card_id ? String(row.card_id) : memberIdentityId,
      public_id: row.public_id ?? session.publicId ?? defaultEmployeePublicId({ tenantId: session.tenantId, memberIdentityId }),
      display_name: row.display_name ?? row.member_name,
      title: row.title,
      company: session.tenantName ?? `Tenant ${session.tenantId}`,
      avatar_url: row.avatar_url,
      fields: this.decryptJson(row.fields_encrypted) ?? defaultFields(),
      status: normalizeStatus(row.card_status ?? row.member_status),
      privacy: parsePrivacy(row.privacy_json)
    };
  }

  private async readStyle(
    tx: TenantTransactionClient,
    tenantId: string,
    cardId: string
  ): Promise<UpdateEmployeeCardStyleRequest> {
    const result = await tx.query<StyleRow>(
      `
        SELECT background_url, color_scheme_json, layout_json
        FROM card_style_overrides
        WHERE tenant_id = $1
          AND card_id = $2
          AND deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `,
      [tenantId, cardId]
    );
    const row = result.rows[0];
    if (!row) {
      return {};
    }
    const layout = parseObject(row.layout_json);
    const templateId = typeof layout.__template_id === "string" ? layout.__template_id : undefined;
    const { __template_id: _templateId, ...publicLayout } = layout;
    return {
      template_id: templateId,
      background_url: row.background_url,
      color_scheme: parseObject(row.color_scheme_json),
      layout: publicLayout
    };
  }

  private async upsertStyle(
    tx: TenantTransactionClient,
    tenantId: string,
    cardId: string,
    style: UpdateEmployeeCardStyleRequest
  ): Promise<void> {
    const layout = {
      ...(style.layout ?? {}),
      ...(style.template_id ? { __template_id: style.template_id } : {})
    };
    const values = [
      tenantId,
      cardId,
      style.background_url ?? null,
      JSON.stringify(style.color_scheme ?? {}),
      JSON.stringify(layout)
    ];
    const updated = await tx.query(
      `
        UPDATE card_style_overrides
        SET background_url = $3,
            color_scheme_json = $4::jsonb,
            layout_json = $5::jsonb,
            updated_at = now()
        WHERE tenant_id = $1
          AND card_id = $2
          AND deleted_at IS NULL
      `,
      values
    );
    if (updated.rowCount && updated.rowCount > 0) {
      return;
    }
    await tx.query(
      `
        INSERT INTO card_style_overrides (
          tenant_id,
          card_id,
          background_url,
          color_scheme_json,
          layout_json,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, now(), now())
      `,
      values
    );
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

  private encryptJson(fields: CardFields): string {
    if (!this.cipher) {
      throw new Error("Card field cipher is required for employee card persistence");
    }
    return this.cipher.encrypt(JSON.stringify(fields));
  }

  private decryptJson(value: string | null): CardFields | null {
    if (!value || !this.cipher) {
      return null;
    }
    try {
      return normalizeFields(JSON.parse(this.cipher.decrypt(value)));
    } catch {
      return null;
    }
  }

  private cardKey(session: EmployeeSession): string {
    return `${session.tenantId}:${session.memberIdentityId}`;
  }

  private ensureCurrentCardInMemory(session: EmployeeSession): EmployeeCardResponse {
    const key = this.cardKey(session);
    const existing = this.cards.get(key);
    if (existing) {
      if (session.status && existing.status !== session.status) {
        const next: EmployeeCardResponse = {
          ...existing,
          fields: { ...existing.fields },
          privacy: { ...existing.privacy },
          status: session.status
        };
        this.cards.set(key, next);
        return next;
      }
      return existing;
    }

    const card: EmployeeCardResponse = {
      card_id: session.memberIdentityId,
      public_id: session.publicId ?? defaultEmployeePublicId(session),
      display_name: session.displayName ?? session.openUserid,
      title: null,
      company: session.tenantName ?? `Tenant ${session.tenantId}`,
      avatar_url: null,
      fields: defaultFields(),
      status: session.status ?? "active",
      privacy: defaultPrivacy()
    };
    this.cards.set(key, card);
    return card;
  }

  private cloneCard(card: EmployeeCardResponse): EmployeeCardResponse {
    return {
      ...card,
      fields: { ...card.fields },
      privacy: { ...card.privacy },
      editable_fields: card.editable_fields ? [...card.editable_fields] : undefined
    };
  }

  private toPreview(card: EmployeeCardResponse, style: UpdateEmployeeCardStyleRequest): EmployeeCardPreviewResponse {
    const email = card.privacy.show_email ? normalizePublicEmail(card.fields.email) : null;
    const websiteUrl = normalizePublicUrl(card.fields.website);
    return {
      public_id: card.public_id,
      status: card.status,
      card: {
        display_name: card.display_name,
        title: card.title,
        company: card.company,
        avatar_url: card.avatar_url,
        fields: {
          mobile: card.privacy.show_mobile ? card.fields.mobile : null,
          phone: card.fields.phone ?? null,
          email,
          wechat_id: card.privacy.show_wechat ? card.fields.wechat_id : null,
          address: card.fields.address ?? null
        }
      },
      template: {
        template_id: style.template_id ?? "tpl_demo_business",
        logo_url: null,
        background_url: style.background_url ?? null,
        color_scheme: style.color_scheme ?? {
          primary: "#1677ff",
          surface: "#ffffff"
        },
        layout: style.layout ?? {
          variant: "horizontal-business"
        }
      },
      company_profile: {
        name: card.company ?? "Demo Tenant",
        intro_blocks: [
          {
            type: "paragraph",
            text: "Published company introduction is managed in the admin console."
          }
        ],
        website_url: websiteUrl,
        address: card.fields.address ?? null
      },
      videos: [],
      honors: []
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }

  private async editableFields(tx: TenantTransactionClient, session: EmployeeSession): Promise<EditableFieldKey[]> {
    if (session.identityType === "personal") {
      return defaultEditableFields();
    }
    const result = await tx.query<{ fields_json: unknown }>(
      `
        SELECT fields_json
        FROM tenant_field_settings
        WHERE tenant_id = $1
      `,
      [session.tenantId]
    );
    return parseEditableFields(result.rows[0]?.fields_json);
  }

  private async materializeStorageFields(
    session: EmployeeSession,
    request: UpdateEmployeeCardRequest
  ): Promise<UpdateEmployeeCardRequest> {
    if (!request.avatar_url || !request.avatar_url.startsWith("data:image/")) {
      return request;
    }
    if (!this.storage) {
      return request;
    }
    const stored = await this.storage.storeImageDataUrl({
      tenantId: session.tenantId,
      category: "avatars",
      dataUrl: request.avatar_url
    });
    return { ...request, avatar_url: stored.publicUrl };
  }

  private async materializeStyleStorageFields(
    session: EmployeeSession,
    request: UpdateEmployeeCardStyleRequest
  ): Promise<UpdateEmployeeCardStyleRequest> {
    if (!request.background_url || !request.background_url.startsWith("data:image/")) {
      return request;
    }
    if (!this.storage) {
      return request;
    }
    const stored = await this.storage.storeImageDataUrl({
      tenantId: session.tenantId,
      category: "card-backgrounds",
      dataUrl: request.background_url
    });
    return { ...request, background_url: stored.publicUrl };
  }
}

function mergeCard(
  current: EmployeeCardResponse,
  request: UpdateEmployeeCardRequest,
  allowedFields: readonly EditableFieldKey[]
): EmployeeCardResponse {
  const next: EmployeeCardResponse = {
    ...current,
    fields: { ...current.fields },
    privacy: { ...current.privacy },
    editable_fields: [...allowedFields]
  };
  if (allowedFields.includes("avatar_url") && request.avatar_url !== undefined) {
    next.avatar_url = request.avatar_url;
  }
  if (allowedFields.includes("display_name") && request.display_name !== undefined) {
    next.display_name = request.display_name;
  }
  if (allowedFields.includes("title") && request.title !== undefined) {
    next.title = request.title;
  }
  if (allowedFields.includes("department") && request.fields?.department !== undefined) {
    next.fields.department = request.fields.department;
  }
  if (allowedFields.includes("mobile") && request.fields?.mobile !== undefined) {
    next.fields.mobile = request.fields.mobile;
  }
  if (allowedFields.includes("phone") && request.fields?.phone !== undefined) {
    next.fields.phone = request.fields.phone;
  }
  if (allowedFields.includes("email") && request.fields?.email !== undefined) {
    next.fields.email = request.fields.email;
  }
  if (allowedFields.includes("wechat_id") && request.fields?.wechat_id !== undefined) {
    next.fields.wechat_id = request.fields.wechat_id;
  }
  if (allowedFields.includes("address") && request.fields?.address !== undefined) {
    next.fields.address = request.fields.address;
  }
  if (allowedFields.includes("website") && request.fields?.website !== undefined) {
    next.fields.website = request.fields.website;
  }
  if (request.privacy?.show_mobile !== undefined) {
    next.privacy.show_mobile = request.privacy.show_mobile;
  }
  if (request.privacy?.show_email !== undefined) {
    next.privacy.show_email = request.privacy.show_email;
  }
  if (request.privacy?.show_wechat !== undefined) {
    next.privacy.show_wechat = request.privacy.show_wechat;
  }
  return next;
}

function normalizePublicUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizePublicEmail(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}

function mergeStyle(
  current: UpdateEmployeeCardStyleRequest,
  request: UpdateEmployeeCardStyleRequest
): UpdateEmployeeCardStyleRequest {
  return {
    ...current,
    ...request,
    color_scheme: request.color_scheme ?? current.color_scheme,
    layout: request.layout ?? current.layout
  };
}

function defaultFields(): CardFields {
  return {
    department: null,
    mobile: null,
    phone: null,
    email: null,
    wechat_id: null,
    address: null,
    website: null
  };
}

function normalizeFields(value: unknown): CardFields {
  const record = isRecord(value) ? value : {};
  return {
    department: typeof record.department === "string" ? record.department : null,
    mobile: typeof record.mobile === "string" ? record.mobile : null,
    phone: typeof record.phone === "string" ? record.phone : null,
    email: typeof record.email === "string" ? record.email : null,
    wechat_id: typeof record.wechat_id === "string" ? record.wechat_id : null,
    address: typeof record.address === "string" ? record.address : null,
    website: typeof record.website === "string" ? record.website : null
  };
}

function defaultPrivacy(): CardPrivacy {
  return {
    show_mobile: false,
    show_email: true,
    show_wechat: false
  };
}

function defaultEditableFields(): EditableFieldKey[] {
  return ["avatar_url", "display_name", "title", "department", "mobile", "phone", "email", "wechat_id", "address", "website"];
}

function parseEditableFields(value: unknown): EditableFieldKey[] {
  const rules = parseJsonValue(value);
  if (!Array.isArray(rules)) {
    return defaultEditableFields();
  }
  const editable = rules
    .filter((rule): rule is { field_key: EditableFieldKey; locked?: boolean; employee_editable?: boolean } =>
      isRecord(rule) && isEditableFieldKey(rule.field_key)
    )
    .filter((rule) => rule.locked !== true && rule.employee_editable !== false)
    .map((rule) => rule.field_key);
  return editable.length ? editable : [];
}

function assertCanUpdate(request: UpdateEmployeeCardRequest, allowedFields: readonly EditableFieldKey[]): void {
  const requested = requestedEditableFields(request);
  const denied = requested.filter((field) => !allowedFields.includes(field));
  if (denied.length) {
    throw new ForbiddenException(`field not employee editable: ${denied.join(", ")}`);
  }
}

function requestedEditableFields(request: UpdateEmployeeCardRequest): EditableFieldKey[] {
  const fields = new Set<EditableFieldKey>();
  if (request.avatar_url !== undefined) fields.add("avatar_url");
  if (request.display_name !== undefined) fields.add("display_name");
  if (request.title !== undefined) fields.add("title");
  if (request.fields?.department !== undefined) fields.add("department");
  if (request.fields?.mobile !== undefined) fields.add("mobile");
  if (request.fields?.phone !== undefined) fields.add("phone");
  if (request.fields?.email !== undefined) fields.add("email");
  if (request.fields?.wechat_id !== undefined) fields.add("wechat_id");
  if (request.fields?.address !== undefined) fields.add("address");
  if (request.fields?.website !== undefined) fields.add("website");
  return [...fields];
}

function isEditableFieldKey(value: unknown): value is EditableFieldKey {
  return (
    value === "avatar_url" ||
    value === "display_name" ||
    value === "title" ||
    value === "department" ||
    value === "mobile" ||
    value === "phone" ||
    value === "email" ||
    value === "wechat_id" ||
    value === "address" ||
    value === "website"
  );
}

function parsePrivacy(value: unknown): CardPrivacy {
  const record = isRecord(value) ? value : {};
  return {
    show_mobile: typeof record.show_mobile === "boolean" ? record.show_mobile : false,
    show_email: typeof record.show_email === "boolean" ? record.show_email : true,
    show_wechat: typeof record.show_wechat === "boolean" ? record.show_wechat : false
  };
}

function parseObject(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatus(status: string): "active" | "disabled" {
  return status === "active" ? "active" : "disabled";
}
