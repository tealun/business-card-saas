import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PublicCardResponse } from "../contracts/public-card.js";
import { randomToken } from "../common/id.js";

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
  private readonly publicCards = new Map<string, PublicCardResponse>([
    [
      "pub_demo0001",
      {
        public_id: "pub_demo0001",
        status: "active",
        card: {
          display_name: "M1 Demo Employee",
          title: "Sales Consultant",
          company: "Demo Tenant",
          avatar_url: null,
          fields: {
            mobile: null,
            phone: "021-5566XXXX",
            email: "demo@example.com",
            wechat_id: null,
            address: "[示例地址]"
          }
        },
        template: {
          template_id: "tpl_demo_business",
          logo_url: null,
          background_url: null,
          color_scheme: {
            primary: "#1677ff",
            surface: "#ffffff"
          },
          layout: {
            variant: "horizontal-business"
          }
        },
        company_profile: {
          name: "Demo Tenant",
          intro_blocks: [
            {
              type: "paragraph",
              text: "这是一份 M1 演示企业介绍。正式环境由企业后台维护，公开名片只展示已发布内容。"
            }
          ],
          website_url: "https://example.com",
          address: "[示例地址]"
        },
        videos: [
          {
            video_id: "vid_demo_company",
            title: "企业介绍视频",
            video_url: "https://example.com/company-video.mp4",
            cover_url: null
          }
        ],
        honors: [
          {
            honor_id: "honor_demo_001",
            title: "公司荣誉",
            body: "荣誉内容示例，M2 接入企业内容管理后由后台维护。",
            images: [
              {
                image_url: "https://example.com/honor.jpg",
                title: "荣誉证书",
                caption: "示例图片"
              }
            ]
          }
        ]
      }
    ]
  ]);

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
}
