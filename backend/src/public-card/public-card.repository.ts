import { BadRequestException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import type { PublicCardResponse } from "../contracts/public-card.js";
import { randomToken } from "../common/id.js";
import { demoPublicCard } from "../fixtures/demo-cards.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantTx, type TenantTransactionClient } from "../database/tenant-tx.service.js";
import { CardFieldCipherService } from "../admin-management/card-field-cipher.service.js";

export interface CardVisitRecord {
  visitId: string;
  publicId: string;
  shareId: string | null;
  anonId: string;
  createdAt: Date;
}

export interface CardShareRecord {
  shareId: string;
  publicId: string;
  parentShareId: string | null;
  depth: number;
  createdAt: Date;
}

export interface PublicCardStats {
  visitor_count: number;
  visit_count: number;
  like_count: number;
  liked_by_current_visitor?: boolean;
}

interface DirectoryRow extends QueryResultRow {
  tenant_id: string | number | bigint;
  card_id: string | number | bigint;
  status: PublicCardResponse["status"];
}

interface PublicCardRow extends QueryResultRow {
  card_id: string | number | bigint;
  member_identity_id: string | number | bigint;
  public_id: string;
  display_name: string | null;
  title: string | null;
  avatar_url: string | null;
  fields_encrypted: string | null;
  privacy_json: unknown;
  card_status: PublicCardResponse["status"];
  company_name: string | null;
  website_url: string | null;
  address: string | null;
  intro_json: unknown;
  background_url: string | null;
  color_scheme_json: unknown;
  layout_json: unknown;
}

interface VideoRow extends QueryResultRow {
  id: string | number | bigint;
  title: string;
  video_url: string;
  cover_url: string | null;
}

interface HonorRow extends QueryResultRow {
  id: string | number | bigint;
  title: string;
  body: string | null;
  image_url: string | null;
  image_title: string | null;
  image_caption: string | null;
}

interface VisitRow extends QueryResultRow {
  visit_id: string;
  share_id: string | null;
  anon_id: string | null;
  created_at: Date | string;
}

interface ShareRow extends QueryResultRow {
  public_share_id: string;
  parent_share_id: string | null;
  depth: number;
  created_at: Date | string;
}

@Injectable()
export class PublicCardRepository {
  private readonly publicCards = new Map<string, PublicCardResponse>([["pub_demo0001", demoPublicCard]]);

  private readonly visits = new Map<string, CardVisitRecord>();
  private readonly actions = new Set<string>();
  private readonly shares = new Map<string, CardShareRecord>([
    [
      "shr_demo0001",
      {
        shareId: "shr_demo0001",
        publicId: "pub_demo0001",
        parentShareId: null,
        depth: 0,
        createdAt: new Date(0)
      }
    ]
  ]);

  constructor(
    @Optional() private readonly database?: DatabaseService,
    @Optional() private readonly tenantTx?: TenantTx,
    @Optional() private readonly cipher?: CardFieldCipherService
  ) {}

  async findPublicCard(publicId: string): Promise<PublicCardResponse> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(publicId);
      return this.tenantTx!.run(directory.tenantId, async (tx) => this.readPublicCard(tx, publicId, directory));
    }
    const card = this.publicCards.get(publicId);
    if (!card) {
      throw new NotFoundException("card not found or disabled");
    }
    return this.clonePublicCard(card);
  }

  async getStats(publicId: string, anonId?: string): Promise<PublicCardStats> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(publicId);
      return this.tenantTx!.run(directory.tenantId, (tx) => this.readStats(tx, directory, anonId));
    }
    return this.readStatsInMemory(publicId, anonId);
  }

  async upsertPublicCard(card: PublicCardResponse): Promise<void> {
    if (this.hasDatabase()) {
      return;
    }
    this.publicCards.set(card.public_id, this.clonePublicCard(card));
  }

  async createVisit(input: { publicId: string; shareId?: string; anonId: string }): Promise<CardVisitRecord> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(input.publicId);
      const visitId = randomToken("vis", 18);
      const shareId = await this.resolveShareIdInDb(directory, input.publicId, input.shareId);
      const result = await this.tenantTx!.run(directory.tenantId, (tx) =>
        tx.query<VisitRow>(
          `
            INSERT INTO card_visits (
              tenant_id,
              card_id,
              member_identity_id,
              share_id,
              visit_id,
              anon_id,
              created_at
            )
            SELECT tenant_id, id, member_identity_id, $3, $4, $5, now()
            FROM cards
            WHERE tenant_id = $1 AND id = $2
            RETURNING visit_id, share_id, anon_id, created_at
          `,
          [directory.tenantId, directory.cardId, shareId, visitId, input.anonId]
        )
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException("card not found or disabled");
      }
      return {
        visitId: row.visit_id,
        publicId: input.publicId,
        shareId: row.share_id,
        anonId: row.anon_id ?? input.anonId,
        createdAt: new Date(row.created_at)
      };
    }

    await this.findPublicCard(input.publicId);
    const visit: CardVisitRecord = {
      visitId: randomToken("vis", 18),
      publicId: input.publicId,
      shareId: this.resolveShareIdInMemory(input.publicId, input.shareId),
      anonId: input.anonId,
      createdAt: new Date()
    };
    this.visits.set(visit.visitId, visit);
    return visit;
  }

  async registerRootShare(input: { publicId: string; shareId: string }): Promise<void> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(input.publicId);
      await this.tenantTx!.run(directory.tenantId, async (tx) => {
        await tx.query(
          `
            INSERT INTO card_shares (
              tenant_id,
              card_id,
              member_identity_id,
              public_share_id,
              parent_share_id,
              issuer_type,
              depth,
              created_at
            )
            SELECT tenant_id, id, member_identity_id, $3, NULL, 'member', 0, now()
            FROM cards
            WHERE tenant_id = $1 AND id = $2
            ON CONFLICT (public_share_id) DO NOTHING
          `,
          [directory.tenantId, directory.cardId, input.shareId]
        );
      });
      return;
    }

    await this.findPublicCard(input.publicId);
    if (this.shares.has(input.shareId)) {
      return;
    }
    this.shares.set(input.shareId, {
      shareId: input.shareId,
      publicId: input.publicId,
      parentShareId: null,
      depth: 0,
      createdAt: new Date()
    });
  }

  async findVisit(publicId: string, visitId: string): Promise<CardVisitRecord | undefined> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(publicId);
      const result = await this.tenantTx!.run(directory.tenantId, (tx) =>
        tx.query<VisitRow>(
          `
            SELECT visit_id, share_id, anon_id, created_at
            FROM card_visits
            WHERE tenant_id = $1
              AND card_id = $2
              AND visit_id = $3
            LIMIT 1
          `,
          [directory.tenantId, directory.cardId, visitId]
        )
      );
      const row = result.rows[0];
      return row
        ? {
            visitId: row.visit_id,
            publicId,
            shareId: row.share_id,
            anonId: row.anon_id ?? "",
            createdAt: new Date(row.created_at)
          }
        : undefined;
    }
    return this.visits.get(visitId);
  }

  async recordAction(publicId: string, visitId: string, actionType: string): Promise<{ idempotent: boolean }> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(publicId);
      const result = await this.tenantTx!.run(directory.tenantId, (tx) =>
        actionType === "like_card"
          ? this.recordUniqueVisitorAction(tx, directory, visitId, actionType)
          : this.recordVisitAction(tx, directory, visitId, actionType)
      );
      return { idempotent: result.rowCount === 0 };
    }

    const key = `${visitId}:${actionType}`;
    if (actionType === "like_card") {
      const visit = this.visits.get(visitId);
      const likeKey = `${publicId}:${actionType}:${visit?.anonId || visitId}`;
      const idempotent = this.actions.has(likeKey);
      this.actions.add(likeKey);
      return { idempotent };
    }
    const idempotent = this.actions.has(key);
    this.actions.add(key);
    return { idempotent };
  }

  async deriveShare(input: { publicId: string; parentShareId: string }): Promise<CardShareRecord & { capped: boolean }> {
    if (this.hasDatabase()) {
      const directory = await this.resolveDirectory(input.publicId);
      const parent = await this.findShareInDb(directory, input.parentShareId);
      if (!parent) {
        throw new BadRequestException("parent share not found for card");
      }
      if (parent.depth >= 3) {
        return { ...parent, publicId: input.publicId, capped: true };
      }
      const shareId = randomToken("shr", 18);
      const result = await this.tenantTx!.run(directory.tenantId, (tx) =>
        tx.query<ShareRow>(
          `
            INSERT INTO card_shares (
              tenant_id,
              card_id,
              member_identity_id,
              public_share_id,
              parent_share_id,
              issuer_type,
              depth,
              created_at
            )
            SELECT tenant_id, id, member_identity_id, $3, $4, 'visitor', $5, now()
            FROM cards
            WHERE tenant_id = $1 AND id = $2
            RETURNING public_share_id, parent_share_id, depth, created_at
          `,
          [directory.tenantId, directory.cardId, shareId, input.parentShareId, parent.depth + 1]
        )
      );
      const row = result.rows[0];
      if (!row) {
        throw new BadRequestException("parent share not found for card");
      }
      return {
        shareId: row.public_share_id,
        publicId: input.publicId,
        parentShareId: row.parent_share_id,
        depth: Number(row.depth),
        createdAt: new Date(row.created_at),
        capped: false
      };
    }

    await this.findPublicCard(input.publicId);
    const parent = this.shares.get(input.parentShareId);
    if (!parent || parent.publicId !== input.publicId) {
      throw new BadRequestException("parent share not found for card");
    }

    if (parent.depth >= 3) {
      return { ...parent, capped: true };
    }

    const share: CardShareRecord = {
      shareId: randomToken("shr", 18),
      publicId: input.publicId,
      parentShareId: parent.shareId,
      depth: parent.depth + 1,
      createdAt: new Date()
    };
    this.shares.set(share.shareId, share);
    return { ...share, capped: false };
  }

  private async resolveDirectory(publicId: string): Promise<{ tenantId: string; cardId: string; status: PublicCardResponse["status"] }> {
    const result = await this.database!.query<DirectoryRow>(
      `
        SELECT tenant_id, card_id, status
        FROM public_card_directory
        WHERE public_id = $1
        LIMIT 1
      `,
      [publicId]
    );
    const row = result.rows[0];
    if (!row || row.status !== "active") {
      throw new NotFoundException("card not found or disabled");
    }
    return {
      tenantId: String(row.tenant_id),
      cardId: String(row.card_id),
      status: row.status
    };
  }

  private async readPublicCard(
    tx: TenantTransactionClient,
    publicId: string,
    directory: { tenantId: string; cardId: string; status: PublicCardResponse["status"] }
  ): Promise<PublicCardResponse> {
    const result = await tx.query<PublicCardRow>(
      `
        SELECT
          cards.id AS card_id,
          cards.member_identity_id,
          cards.public_id,
          cards.display_name,
          cards.title,
          cards.avatar_url,
          cards.fields_encrypted,
          cards.privacy_json,
          cards.status AS card_status,
          company_profiles.display_name AS company_name,
          company_profiles.website_url,
          company_profiles.address,
          company_profiles.intro_json,
          card_style_overrides.background_url,
          card_style_overrides.color_scheme_json,
          card_style_overrides.layout_json
        FROM cards
        LEFT JOIN company_profiles
          ON company_profiles.tenant_id = cards.tenant_id
          AND company_profiles.deleted_at IS NULL
          AND company_profiles.visible = true
        LEFT JOIN LATERAL (
          SELECT background_url, color_scheme_json, layout_json
          FROM card_style_overrides
          WHERE card_style_overrides.tenant_id = cards.tenant_id
            AND card_style_overrides.card_id = cards.id
            AND card_style_overrides.deleted_at IS NULL
          ORDER BY card_style_overrides.id DESC
          LIMIT 1
        ) card_style_overrides ON true
        WHERE cards.tenant_id = $1
          AND cards.id = $2
          AND cards.public_id = $3
          AND cards.deleted_at IS NULL
        LIMIT 1
      `,
      [directory.tenantId, directory.cardId, publicId]
    );
    const row = result.rows[0];
    if (!row || row.card_status !== "active") {
      throw new NotFoundException("card not found or disabled");
    }
    const [videos, honors, stats] = await Promise.all([
      this.readVideos(tx, directory.tenantId),
      this.readHonors(tx, directory.tenantId),
      this.readStats(tx, directory)
    ]);
    return this.toPublicCard(row, videos, honors, stats);
  }

  private async readStats(
    tx: TenantTransactionClient,
    directory: { tenantId: string; cardId: string },
    anonId?: string
  ): Promise<PublicCardStats> {
    const totals = await tx.query<{ visit_count: string; visitor_count: string }>(
      `
        SELECT
          count(*)::text AS visit_count,
          count(DISTINCT COALESCE(visitor_account_id::text, anon_id, id::text))::text AS visitor_count
        FROM card_visits
        WHERE tenant_id = $1 AND card_id = $2
      `,
      [directory.tenantId, directory.cardId]
    );
    const likes = await tx.query<{ like_count: string }>(
      `
        SELECT count(DISTINCT COALESCE(card_visits.visitor_account_id::text, card_visits.anon_id, card_visits.id::text))::text AS like_count
        FROM card_actions
        JOIN card_visits
          ON card_visits.tenant_id = card_actions.tenant_id
          AND card_visits.card_id = card_actions.card_id
          AND card_visits.visit_id = card_actions.visit_id
        WHERE card_actions.tenant_id = $1
          AND card_actions.card_id = $2
          AND card_actions.action_type = 'like_card'
      `,
      [directory.tenantId, directory.cardId]
    );
    const liked = anonId
      ? await tx.query<{ liked: boolean }>(
          `
            SELECT EXISTS (
              SELECT 1
              FROM card_actions
              JOIN card_visits action_visits
                ON action_visits.tenant_id = card_actions.tenant_id
                AND action_visits.card_id = card_actions.card_id
                AND action_visits.visit_id = card_actions.visit_id
              WHERE card_actions.tenant_id = $1
                AND card_actions.card_id = $2
                AND card_actions.action_type = 'like_card'
                AND COALESCE(action_visits.anon_id, action_visits.visitor_account_id::text, action_visits.id::text) = $3
            ) AS liked
          `,
          [directory.tenantId, directory.cardId, anonId]
        )
      : null;
    return {
      visitor_count: Number(totals.rows[0]?.visitor_count ?? 0),
      visit_count: Number(totals.rows[0]?.visit_count ?? 0),
      like_count: Number(likes.rows[0]?.like_count ?? 0),
      liked_by_current_visitor: Boolean(liked?.rows[0]?.liked)
    };
  }

  private readStatsInMemory(publicId: string, anonId?: string): PublicCardStats {
    const visits = [...this.visits.values()].filter((visit) => visit.publicId === publicId);
    const visitors = new Set(visits.map((visit) => visit.anonId || visit.visitId));
    const likeKeys = [...this.actions].filter((key) => key.startsWith(`${publicId}:like_card:`));
    return {
      visitor_count: visitors.size,
      visit_count: visits.length,
      like_count: likeKeys.length,
      liked_by_current_visitor: anonId ? this.actions.has(`${publicId}:like_card:${anonId}`) : false
    };
  }

  private async readVideos(tx: TenantTransactionClient, tenantId: string): Promise<PublicCardResponse["videos"]> {
    const result = await tx.query<VideoRow>(
      `
        SELECT id, title, video_url, cover_url
        FROM company_videos
        WHERE tenant_id = $1
          AND visible = true
          AND status = 'published'
          AND deleted_at IS NULL
        ORDER BY sort_order ASC, id ASC
        LIMIT 10
      `,
      [tenantId]
    );
    return result.rows.map((row) => ({
      video_id: String(row.id),
      title: row.title,
      video_url: row.video_url,
      cover_url: row.cover_url
    }));
  }

  private async readHonors(tx: TenantTransactionClient, tenantId: string): Promise<PublicCardResponse["honors"]> {
    const result = await tx.query<HonorRow>(
      `
        SELECT
          company_honors.id,
          company_honors.title,
          company_honors.body,
          company_honor_images.image_url,
          company_honor_images.title AS image_title,
          company_honor_images.caption AS image_caption
        FROM company_honors
        LEFT JOIN company_honor_images
          ON company_honor_images.tenant_id = company_honors.tenant_id
          AND company_honor_images.honor_id = company_honors.id
          AND company_honor_images.deleted_at IS NULL
        WHERE company_honors.tenant_id = $1
          AND company_honors.visible = true
          AND company_honors.status = 'published'
          AND company_honors.deleted_at IS NULL
        ORDER BY company_honors.sort_order ASC, company_honors.id ASC, company_honor_images.sort_order ASC
        LIMIT 50
      `,
      [tenantId]
    );
    const honors = new Map<string, PublicCardResponse["honors"][number]>();
    for (const row of result.rows) {
      const honorId = String(row.id);
      const honor =
        honors.get(honorId) ??
        ({
          honor_id: honorId,
          title: row.title,
          body: row.body,
          images: []
        } satisfies PublicCardResponse["honors"][number]);
      if (row.image_url) {
        honor.images.push({
          image_url: row.image_url,
          title: row.image_title,
          caption: row.image_caption
        });
      }
      honors.set(honorId, honor);
    }
    return [...honors.values()];
  }

  private toPublicCard(
    row: PublicCardRow,
    videos: PublicCardResponse["videos"],
    honors: PublicCardResponse["honors"],
    stats: PublicCardStats
  ): PublicCardResponse {
    const fields = this.decryptFields(row.fields_encrypted);
    const privacy = parsePrivacy(row.privacy_json);
    const layout = parseObject(row.layout_json);
    const templateId = typeof layout.__template_id === "string" ? layout.__template_id : "tpl_demo_business";
    const { __template_id: _templateId, ...publicLayout } = layout;
    return {
      public_id: row.public_id,
      status: row.card_status,
      card: {
        display_name: row.display_name ?? "Unnamed",
        title: row.title,
        company: row.company_name,
        avatar_url: row.avatar_url,
        fields: {
          mobile: privacy.show_mobile ? fields.mobile : null,
          phone: fields.phone,
          email: privacy.show_email ? fields.email : null,
          wechat_id: privacy.show_wechat ? fields.wechat_id : null,
          address: fields.address
        }
      },
      template: {
        template_id: templateId,
        logo_url: null,
        background_url: row.background_url,
        color_scheme: Object.keys(parseObject(row.color_scheme_json)).length
          ? parseObject(row.color_scheme_json)
          : { primary: "#1677ff", surface: "#ffffff" },
        layout: Object.keys(publicLayout).length ? publicLayout : { variant: "horizontal-business" }
      },
      company_profile: {
        name: row.company_name ?? "Demo Tenant",
        intro_blocks: parseIntroBlocks(row.intro_json),
        website_url: row.website_url,
        address: row.address ?? fields.address
      },
      videos,
      honors,
      stats
    };
  }

  private recordVisitAction(
    tx: TenantTransactionClient,
    directory: { tenantId: string; cardId: string },
    visitId: string,
    actionType: string
  ) {
    return tx.query(
      `
        INSERT INTO card_actions (
          tenant_id,
          card_id,
          member_identity_id,
          action_type,
          share_id,
          visit_id,
          created_at
        )
        SELECT tenant_id, card_id, member_identity_id, $4, share_id, visit_id, now()
        FROM card_visits
        WHERE tenant_id = $1
          AND card_id = $2
          AND visit_id = $3
        ON CONFLICT (visit_id, action_type) DO NOTHING
      `,
      [directory.tenantId, directory.cardId, visitId, actionType]
    );
  }

  private recordUniqueVisitorAction(
    tx: TenantTransactionClient,
    directory: { tenantId: string; cardId: string },
    visitId: string,
    actionType: string
  ) {
    return tx.query(
      `
        INSERT INTO card_actions (
          tenant_id,
          card_id,
          member_identity_id,
          action_type,
          share_id,
          visit_id,
          created_at
        )
        SELECT current_visit.tenant_id,
               current_visit.card_id,
               current_visit.member_identity_id,
               $4,
               current_visit.share_id,
               current_visit.visit_id,
               now()
        FROM card_visits current_visit
        WHERE current_visit.tenant_id = $1
          AND current_visit.card_id = $2
          AND current_visit.visit_id = $3
          AND NOT EXISTS (
            SELECT 1
            FROM card_actions existing_action
            JOIN card_visits existing_visit
              ON existing_visit.tenant_id = existing_action.tenant_id
              AND existing_visit.card_id = existing_action.card_id
              AND existing_visit.visit_id = existing_action.visit_id
            WHERE existing_action.tenant_id = $1
              AND existing_action.card_id = $2
              AND existing_action.action_type = $4
              AND COALESCE(existing_visit.anon_id, existing_visit.visitor_account_id::text, existing_visit.id::text) =
                  COALESCE(current_visit.anon_id, current_visit.visitor_account_id::text, current_visit.id::text)
          )
        ON CONFLICT (visit_id, action_type) DO NOTHING
      `,
      [directory.tenantId, directory.cardId, visitId, actionType]
    );
  }

  private async resolveShareIdInDb(
    directory: { tenantId: string; cardId: string },
    publicId: string,
    shareId: string | undefined
  ): Promise<string | null> {
    if (!shareId) {
      return null;
    }
    const share = await this.findShareInDb(directory, shareId);
    return share ? shareId : null;
  }

  private async findShareInDb(
    directory: { tenantId: string; cardId: string },
    shareId: string
  ): Promise<CardShareRecord | null> {
    const result = await this.tenantTx!.run(directory.tenantId, (tx) =>
      tx.query<ShareRow>(
        `
          SELECT public_share_id, parent_share_id, depth, created_at
          FROM card_shares
          WHERE tenant_id = $1
            AND card_id = $2
            AND public_share_id = $3
          LIMIT 1
        `,
        [directory.tenantId, directory.cardId, shareId]
      )
    );
    const row = result.rows[0];
    return row
        ? {
          shareId: row.public_share_id,
          publicId: "",
          parentShareId: row.parent_share_id,
          depth: Number(row.depth),
          createdAt: new Date(row.created_at)
        }
      : null;
  }

  private resolveShareIdInMemory(publicId: string, shareId: string | undefined): string | null {
    if (!shareId) {
      return null;
    }
    const share = this.shares.get(shareId);
    return share && share.publicId === publicId ? shareId : null;
  }

  private decryptFields(value: string | null): PublicCardResponse["card"]["fields"] {
    if (!value || !this.cipher) {
      return {
        mobile: null,
        phone: null,
        email: null,
        wechat_id: null,
        address: null
      };
    }
    try {
      const parsed = JSON.parse(this.cipher.decrypt(value)) as Record<string, unknown>;
      return {
        mobile: typeof parsed.mobile === "string" ? parsed.mobile : null,
        phone: typeof parsed.phone === "string" ? parsed.phone : null,
        email: typeof parsed.email === "string" ? parsed.email : null,
        wechat_id: typeof parsed.wechat_id === "string" ? parsed.wechat_id : null,
        address: typeof parsed.address === "string" ? parsed.address : null
      };
    } catch {
      return {
        mobile: null,
        phone: null,
        email: null,
        wechat_id: null,
        address: null
      };
    }
  }

  private clonePublicCard(card: PublicCardResponse): PublicCardResponse {
    return {
      ...card,
      card: {
        ...card.card,
        fields: { ...card.card.fields }
      },
      template: {
        ...card.template,
        color_scheme: { ...card.template.color_scheme },
        layout: { ...card.template.layout }
      },
      company_profile: {
        ...card.company_profile,
        intro_blocks: card.company_profile.intro_blocks.map((block) => ({ ...block }))
      },
      videos: card.videos.map((video) => ({ ...video })),
      honors: card.honors.map((honor) => ({
        ...honor,
        images: honor.images.map((image) => ({ ...image }))
      })),
      stats: { ...card.stats }
    };
  }

  private hasDatabase(): boolean {
    return Boolean(this.database && this.tenantTx && process.env.DATABASE_URL?.trim());
  }
}

function parsePrivacy(value: unknown): { show_mobile: boolean; show_email: boolean; show_wechat: boolean } {
  const record = parseObject(value);
  return {
    show_mobile: typeof record.show_mobile === "boolean" ? record.show_mobile : false,
    show_email: typeof record.show_email === "boolean" ? record.show_email : true,
    show_wechat: typeof record.show_wechat === "boolean" ? record.show_wechat : false
  };
}

function parseObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : {};
}

function parseIntroBlocks(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)) : [];
}
