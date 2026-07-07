import { Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type {
  EmployeeCardPreviewResponse,
  EmployeeCardResponse,
  UpdateEmployeeCardRequest,
  UpdateEmployeeCardStyleRequest
} from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { randomToken } from "../common/id.js";
import { defaultEmployeeCardSlug, defaultEmployeePublicId } from "../common/default-public-id.js";
import { demoEmployeeCard } from "../fixtures/demo-cards.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import { CardFieldCipherService } from "../admin-management/card-field-cipher.service.js";

type CardFields = EmployeeCardResponse["fields"];
type CardPrivacy = EmployeeCardResponse["privacy"];

interface EmployeeCardRow extends QueryResultRow {
  member_id: string | number | bigint;
  member_name: string;
  member_status: "active" | "disabled";
  card_id: string | number | bigint | null;
  public_id: string | null;
  display_name: string | null;
  title: string | null;
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
    @Optional() private readonly cipher?: CardFieldCipherService
  ) {}

  async getCurrentCard(session: EmployeeSession): Promise<EmployeeCardResponse> {
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => this.cloneCard(await this.ensureCurrentCardInDb(tx, session)));
    }
    return this.cloneCard(this.ensureCurrentCardInMemory(session));
  }

  async updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): Promise<EmployeeCardResponse> {
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => {
        const current = await this.ensureCurrentCardInDb(tx, session);
        const next = mergeCard(current, request);
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
                fields_encrypted = $5,
                privacy_json = $6::jsonb,
                status = $7,
                updated_at = now()
            WHERE tenant_id = $1 AND id = $2
          `,
          [
            session.tenantId,
            next.card_id,
            next.display_name,
            next.title,
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
    const next = mergeCard(current, request);
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
    if (this.hasDatabase()) {
      return this.tenantTx!.run(session.tenantId, async (tx) => {
        const card = await this.ensureCurrentCardInDb(tx, session);
        const current = await this.readStyle(tx, session.tenantId, card.card_id);
        const next = mergeStyle(current, request);
        await this.upsertStyle(tx, session.tenantId, card.card_id, next);
        return this.toPreview(card, next);
      });
    }

    const key = this.cardKey(session);
    const card = this.ensureCurrentCardInMemory(session);
    const current = this.styles.get(key) ?? {};
    const next = mergeStyle(current, request);
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
          cards.fields_encrypted,
          cards.privacy_json,
          cards.status AS card_status
        FROM member_identities
        LEFT JOIN LATERAL (
          SELECT id, public_id, display_name, title, fields_encrypted, privacy_json, status
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
      avatar_url: null,
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
      privacy: { ...card.privacy }
    };
  }

  private toPreview(card: EmployeeCardResponse, style: UpdateEmployeeCardStyleRequest): EmployeeCardPreviewResponse {
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
          email: card.privacy.show_email ? card.fields.email : null,
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
        website_url: "https://example.com",
        address: card.fields.address ?? null
      },
      videos: [],
      honors: []
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function mergeCard(current: EmployeeCardResponse, request: UpdateEmployeeCardRequest): EmployeeCardResponse {
  const next: EmployeeCardResponse = {
    ...current,
    fields: { ...current.fields },
    privacy: { ...current.privacy }
  };
  if (request.display_name !== undefined) {
    next.display_name = request.display_name;
  }
  if (request.title !== undefined) {
    next.title = request.title;
  }
  if (request.fields?.mobile !== undefined) {
    next.fields.mobile = request.fields.mobile;
  }
  if (request.fields?.phone !== undefined) {
    next.fields.phone = request.fields.phone;
  }
  if (request.fields?.email !== undefined) {
    next.fields.email = request.fields.email;
  }
  if (request.fields?.wechat_id !== undefined) {
    next.fields.wechat_id = request.fields.wechat_id;
  }
  if (request.fields?.address !== undefined) {
    next.fields.address = request.fields.address;
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
    mobile: null,
    phone: null,
    email: null,
    wechat_id: null,
    address: null
  };
}

function normalizeFields(value: unknown): CardFields {
  const record = isRecord(value) ? value : {};
  return {
    mobile: typeof record.mobile === "string" ? record.mobile : null,
    phone: typeof record.phone === "string" ? record.phone : null,
    email: typeof record.email === "string" ? record.email : null,
    wechat_id: typeof record.wechat_id === "string" ? record.wechat_id : null,
    address: typeof record.address === "string" ? record.address : null
  };
}

function defaultPrivacy(): CardPrivacy {
  return {
    show_mobile: false,
    show_email: true,
    show_wechat: false
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatus(status: string): "active" | "disabled" {
  return status === "active" ? "active" : "disabled";
}
