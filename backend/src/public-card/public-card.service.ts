import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createHmac } from "node:crypto";
import { readSecret } from "../common/secrets.js";
import {
  actionResponseSchema,
  type ActionRequest,
  type ActionResponse,
  deriveShareResponseSchema,
  type DeriveShareRequest,
  type DeriveShareResponse,
  type PublicCardResponse,
  publicCardResponseSchema,
  type VisitRequest,
  type VisitResponse,
  visitResponseSchema
} from "../contracts/public-card.js";
import { PublicCardRepository } from "./public-card.repository.js";
import { VisitTokenService } from "./visit-token.service.js";
import { AnonIdService } from "./anon-id.service.js";
import { randomToken } from "../common/id.js";
import { SessionTokenService } from "../session/session-token.service.js";
import type { EmployeeSession } from "../session/employee-session.js";

interface VisitContext {
  token?: string;
  ipAddress?: string;
}

@Injectable()
export class PublicCardService {
  constructor(
    private readonly repository: PublicCardRepository,
    private readonly visitTokens: VisitTokenService,
    private readonly anonIds: AnonIdService,
    private readonly sessionTokens: SessionTokenService
  ) {}

  async getPublicCard(publicId: string): Promise<PublicCardResponse> {
    return publicCardResponseSchema.parse(await this.repository.findPublicCard(publicId));
  }

  async createVisit(publicId: string, request: VisitRequest, context: VisitContext = {}): Promise<VisitResponse> {
    const session = this.optionalSession(context.token);
    const ipHash = hashIp(context.ipAddress);
    const anonId = this.resolveAnonId(request, session);
    if (session?.publicId === publicId) {
      const stats = await this.repository.getStats(publicId, anonId);
      const visitId = randomToken("vis", 18);
      const visitToken = this.visitTokens.sign({
        visitId,
        publicId,
        shareId: request.share ?? null,
        nonce: randomToken("nonce", 12)
      });
      return visitResponseSchema.parse({
        visit_id: visitId,
        visit_token: visitToken,
        anon_id: anonId,
        expires_in: this.visitTokens.expiresIn,
        stats
      });
    }

    const visitInput: {
      publicId: string;
      shareId?: string;
      anonId: string;
      userAgent?: string;
      ipHash?: string;
      trustLevel?: string;
    } = {
      publicId,
      anonId,
      trustLevel: session ? "authenticated_user" : "anonymous_client"
    };
    if (request.user_agent) {
      visitInput.userAgent = request.user_agent;
    }
    if (ipHash) {
      visitInput.ipHash = ipHash;
    }
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
    const stats = await this.repository.getStats(publicId, visit.anonId);

    return visitResponseSchema.parse({
      visit_id: visit.visitId,
      visit_token: visitToken,
      anon_id: visit.anonId,
      expires_in: this.visitTokens.expiresIn,
      stats
    });
  }

  private resolveAnonId(request: VisitRequest, session: EmployeeSession | undefined): string {
    if (session) {
      return this.anonIds.issueStable("member", session.memberIdentityId || session.accountId || session.openUserid);
    }
    const verifiedAnonId = this.anonIds.verify(request.anon_id);
    if (verifiedAnonId) {
      return verifiedAnonId;
    }
    return this.anonIds.issue();
  }

  private optionalSession(token: string | undefined): EmployeeSession | undefined {
    if (!token) {
      return undefined;
    }
    try {
      return this.sessionTokens.verify(token);
    } catch {
      return undefined;
    }
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
    const stats = request.action_type === "like_card" ? await this.repository.getStats(publicId) : undefined;
    return actionResponseSchema.parse({
      accepted: true,
      idempotent: result.idempotent,
      stats
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
    const card = await this.repository.findPublicCard(publicId);
    if (!card.allow_forward) {
      throw new ForbiddenException("card forwarding is disabled");
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

function hashIp(ipAddress: string | undefined): string | undefined {
  const normalized = ipAddress?.trim();
  if (!normalized) {
    return undefined;
  }
  // Keyed HMAC (not a bare hash): IPv4 space is small enough that an unsalted
  // digest is effectively reversible, and ip_hash is personal data under PIPL.
  return createHmac("sha256", readSecret("VISIT_TOKEN_SECRET")).update(`v1.ip.${normalized}`).digest("hex");
}
