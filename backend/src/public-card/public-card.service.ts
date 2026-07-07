import { Injectable, UnauthorizedException } from "@nestjs/common";
import {
  actionResponseSchema,
  type ActionRequest,
  type ActionResponse,
  deriveShareResponseSchema,
  type DeriveShareRequest,
  type DeriveShareResponse,
  type PublicCardResponse,
  type VisitRequest,
  type VisitResponse,
  visitResponseSchema
} from "../contracts/public-card.js";
import { PublicCardRepository } from "./public-card.repository.js";
import { VisitTokenService } from "./visit-token.service.js";
import { AnonIdService } from "./anon-id.service.js";
import { randomToken } from "../common/id.js";

@Injectable()
export class PublicCardService {
  constructor(
    private readonly repository: PublicCardRepository,
    private readonly visitTokens: VisitTokenService,
    private readonly anonIds: AnonIdService
  ) {}

  async getPublicCard(publicId: string): Promise<PublicCardResponse> {
    return this.repository.findPublicCard(publicId);
  }

  async createVisit(publicId: string, request: VisitRequest): Promise<VisitResponse> {
    // Trust an inbound anon_id only when its server signature verifies; otherwise issue a fresh one.
    const anonId = this.anonIds.verify(request.anon_id) ?? this.anonIds.issue();
    const visitInput: { publicId: string; shareId?: string; anonId: string } = { publicId, anonId };
    if (request.share) {
      visitInput.shareId = request.share;
    }
    const visit = await this.repository.createVisit(visitInput);
    const visitToken = this.visitTokens.sign({
      visitId: visit.visitId,
      publicId,
      shareId: visit.shareId,
      nonce: randomToken("nonce", 12)
    });

    return visitResponseSchema.parse({
      visit_id: visit.visitId,
      visit_token: visitToken,
      anon_id: visit.anonId,
      expires_in: this.visitTokens.expiresIn
    });
  }

  async recordAction(publicId: string, token: string, request: ActionRequest): Promise<ActionResponse> {
    const payload = this.visitTokens.verify(token);
    if (payload.publicId !== publicId) {
      throw new UnauthorizedException("visit_token scope mismatch");
    }
    if (!(await this.repository.findVisit(publicId, payload.visitId))) {
      throw new UnauthorizedException("visit not found");
    }
    const result = await this.repository.recordAction(publicId, payload.visitId, request.action_type);
    return actionResponseSchema.parse({
      accepted: true,
      idempotent: result.idempotent
    });
  }

  async deriveShare(publicId: string, token: string, request: DeriveShareRequest): Promise<DeriveShareResponse> {
    const payload = this.visitTokens.verify(token);
    if (payload.publicId !== publicId) {
      throw new UnauthorizedException("visit_token scope mismatch");
    }
    if (!(await this.repository.findVisit(publicId, payload.visitId))) {
      throw new UnauthorizedException("visit not found");
    }
    const share = await this.repository.deriveShare({
      publicId,
      parentShareId: request.parent_share_id
    });
    return deriveShareResponseSchema.parse({
      share_id: share.shareId,
      parent_share_id: request.parent_share_id,
      depth: share.depth,
      capped: share.capped
    });
  }
}
