import { Injectable, NotFoundException } from "@nestjs/common";
import type { EmployeeCardResponse, UpdateEmployeeCardRequest } from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { randomToken } from "../common/id.js";

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
        email: "demo@example.com",
        wechat_id: "demo_wechat"
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

  getCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    const card = this.cards.get(this.cardKey(session));
    if (!card) {
      throw new NotFoundException("current card not found");
    }

    return this.cloneCard(card);
  }

  updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): EmployeeCardResponse {
    const key = this.cardKey(session);
    const current = this.cards.get(key);
    if (!current) {
      throw new NotFoundException("current card not found");
    }

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
    if (request.fields?.email !== undefined) {
      next.fields.email = request.fields.email;
    }
    if (request.fields?.wechat_id !== undefined) {
      next.fields.wechat_id = request.fields.wechat_id;
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

  createShare(session: EmployeeSession): { publicId: string; shareId: string } {
    const card = this.getCurrentCard(session);
    return {
      publicId: card.public_id,
      shareId: randomToken("shr", 18)
    };
  }

  private cardKey(session: EmployeeSession): string {
    return `${session.tenantId}:${session.memberIdentityId}`;
  }

  private cloneCard(card: EmployeeCardResponse): EmployeeCardResponse {
    return {
      ...card,
      fields: { ...card.fields },
      privacy: { ...card.privacy }
    };
  }
}
