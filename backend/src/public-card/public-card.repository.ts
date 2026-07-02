import { Injectable, NotFoundException } from "@nestjs/common";
import type { PublicCardResponse } from "../contracts/public-card.js";
import { randomToken } from "../common/id.js";

export interface CardVisitRecord {
  visitId: string;
  publicId: string;
  shareId: string | null;
  anonId: string;
  createdAt: Date;
}

@Injectable()
export class PublicCardRepository {
  private readonly publicCards = new Map<string, PublicCardResponse>([
    [
      "pub_demo0001",
      {
        public_id: "pub_demo0001",
        display_name: "M1 Demo Employee",
        title: "Sales Consultant",
        company: "Demo Tenant",
        avatar_url: null,
        fields: {
          mobile: null,
          email: "demo@example.com",
          wechat_id: null
        },
        status: "active"
      }
    ]
  ]);

  private readonly visits = new Map<string, CardVisitRecord>();
  private readonly actions = new Set<string>();

  findPublicCard(publicId: string): PublicCardResponse {
    const card = this.publicCards.get(publicId);
    if (!card) {
      throw new NotFoundException("card not found or disabled");
    }
    return card;
  }

  createVisit(input: { publicId: string; shareId?: string; anonId?: string }): CardVisitRecord {
    this.findPublicCard(input.publicId);
    const visit: CardVisitRecord = {
      visitId: randomToken("vis", 18),
      publicId: input.publicId,
      shareId: input.shareId ?? null,
      anonId: input.anonId ?? randomToken("anon", 24),
      createdAt: new Date()
    };
    this.visits.set(visit.visitId, visit);
    return visit;
  }

  findVisit(visitId: string): CardVisitRecord | undefined {
    return this.visits.get(visitId);
  }

  recordAction(visitId: string, actionType: string): { idempotent: boolean } {
    const key = `${visitId}:${actionType}`;
    const idempotent = this.actions.has(key);
    this.actions.add(key);
    return { idempotent };
  }
}
