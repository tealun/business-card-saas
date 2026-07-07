import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PublicCardResponse } from "../contracts/public-card.js";
import { randomToken } from "../common/id.js";
import { demoPublicCard } from "../fixtures/demo-cards.js";

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

  findPublicCard(publicId: string): PublicCardResponse {
    const card = this.publicCards.get(publicId);
    if (!card) {
      throw new NotFoundException("card not found or disabled");
    }
    return this.clonePublicCard(card);
  }

  upsertPublicCard(card: PublicCardResponse): void {
    this.publicCards.set(card.public_id, this.clonePublicCard(card));
  }

  createVisit(input: { publicId: string; shareId?: string; anonId: string }): CardVisitRecord {
    this.findPublicCard(input.publicId);
    const visit: CardVisitRecord = {
      visitId: randomToken("vis", 18),
      publicId: input.publicId,
      shareId: this.resolveShareId(input.publicId, input.shareId),
      anonId: input.anonId,
      createdAt: new Date()
    };
    this.visits.set(visit.visitId, visit);
    return visit;
  }

  // A12-P2-1: register an employee-issued share so downstream derive/attribution can resolve it.
  registerRootShare(input: { publicId: string; shareId: string }): void {
    this.findPublicCard(input.publicId);
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

  // A12-P2-4: only attribute a visit to a share that exists and belongs to this card;
  // an unknown or foreign share_id is dropped rather than recorded as spoofed attribution.
  private resolveShareId(publicId: string, shareId: string | undefined): string | null {
    if (!shareId) {
      return null;
    }
    const share = this.shares.get(shareId);
    return share && share.publicId === publicId ? shareId : null;
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

  deriveShare(input: { publicId: string; parentShareId: string }): CardShareRecord & { capped: boolean } {
    this.findPublicCard(input.publicId);
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
      }))
    };
  }
}
