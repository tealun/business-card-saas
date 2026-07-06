import { Injectable } from "@nestjs/common";
import type {
  EmployeeCardPreviewResponse,
  EmployeeCardResponse,
  UpdateEmployeeCardRequest,
  UpdateEmployeeCardStyleRequest
} from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { randomToken } from "../common/id.js";
import { defaultEmployeePublicId } from "../common/default-public-id.js";

@Injectable()
export class EmployeeCardRepository {
  private readonly cards = new Map<string, EmployeeCardResponse>([
    [
      "1:1",
      {
      card_id: "1",
      public_id: "pub_demo0001",
      display_name: "M1 Demo Employee",
      title: "Sales Consultant",
      company: "Demo Tenant",
      avatar_url: null,
      fields: {
        mobile: "13800000000",
        phone: "021-5566XXXX",
        email: "demo@example.com",
        wechat_id: "demo_wechat",
        address: "广西桂林市高铁经济产业园长丰路27号"
      },
      status: "active",
      privacy: {
        show_mobile: false,
        show_email: true,
        show_wechat: false
      }
      }
    ]
  ]);

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

  getCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    return this.cloneCard(this.ensureCurrentCard(session));
  }

  updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): EmployeeCardResponse {
    const key = this.cardKey(session);
    const current = this.ensureCurrentCard(session);

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
    this.cards.set(key, next);
    return this.cloneCard(next);
  }

  updateCurrentCardStatus(session: EmployeeSession, status: "active" | "disabled"): EmployeeCardResponse {
    const key = this.cardKey(session);
    const current = this.ensureCurrentCard(session);
    const next: EmployeeCardResponse = {
      ...current,
      fields: { ...current.fields },
      privacy: { ...current.privacy },
      status
    };
    this.cards.set(key, next);
    return this.cloneCard(next);
  }

  createShare(session: EmployeeSession): { publicId: string; shareId: string } {
    const card = this.getCurrentCard(session);
    return {
      publicId: card.public_id,
      shareId: randomToken("shr", 18)
    };
  }

  getPreview(session: EmployeeSession): EmployeeCardPreviewResponse {
    const card = this.getCurrentCard(session);
    const style = this.styles.get(this.cardKey(session)) ?? {};
    return this.toPreview(card, style);
  }

  updateStyle(session: EmployeeSession, request: UpdateEmployeeCardStyleRequest): EmployeeCardPreviewResponse {
    const key = this.cardKey(session);
    this.getCurrentCard(session);
    const current = this.styles.get(key) ?? {};
    const next = {
      ...current,
      ...request,
      color_scheme: request.color_scheme ?? current.color_scheme,
      layout: request.layout ?? current.layout
    };
    this.styles.set(key, next);
    return this.toPreview(this.getCurrentCard(session), next);
  }

  private cardKey(session: EmployeeSession): string {
    return `${session.tenantId}:${session.memberIdentityId}`;
  }

  private ensureCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    const key = this.cardKey(session);
    const existing = this.cards.get(key);
    if (existing) {
      return existing;
    }

    const card: EmployeeCardResponse = {
      card_id: session.memberIdentityId,
      public_id: session.publicId ?? defaultEmployeePublicId(session),
      display_name: session.displayName ?? session.openUserid,
      title: null,
      company: session.tenantName ?? `Tenant ${session.tenantId}`,
      avatar_url: null,
      fields: {
        mobile: null,
        phone: null,
        email: null,
        wechat_id: null,
        address: null
      },
      status: "active",
      privacy: {
        show_mobile: false,
        show_email: true,
        show_wechat: false
      }
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
            text: "这是一份 M1 演示企业介绍。正式环境由企业后台维护，公开名片只展示已发布内容。"
          }
        ],
        website_url: "https://example.com",
        address: card.fields.address ?? null
      },
      videos: [],
      honors: []
    };
  }
}
