import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import {
  exchangeListResponseSchema,
  exchangeMutationResponseSchema,
  type CreateExchangeRequest,
  type ExchangeCardSnapshot
} from "../contracts/card-exchange.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";
import { VisitTokenService } from "../public-card/visit-token.service.js";
import { CardExchangeRepository } from "./card-exchange.repository.js";

@Injectable()
export class CardExchangeService {
  constructor(
    private readonly repository: CardExchangeRepository,
    private readonly publicCards: PublicCardRepository,
    private readonly visitTokens: VisitTokenService
  ) {}

  async create(session: EmployeeSession, request: CreateExchangeRequest) {
    if (!session.publicId) throw new ConflictException("current identity has no active card");
    const visit = this.visitTokens.verify(request.visit_token);
    if (visit.publicId !== request.recipient_public_id || !(await this.publicCards.findVisit(visit.publicId, visit.visitId))) {
      throw new UnauthorizedException("visit_token does not prove access to recipient card");
    }
    if (session.publicId === request.recipient_public_id) throw new ConflictException("cannot exchange with your own card");
    const [sender, recipient] = await Promise.all([
      this.publicCards.findPublicCard(session.publicId),
      this.publicCards.findPublicCard(request.recipient_public_id)
    ]);
    return exchangeMutationResponseSchema.parse(
      await this.repository.create(session, snapshot(sender), snapshot(recipient), visit.visitId)
    );
  }

  async list(session: EmployeeSession) {
    return exchangeListResponseSchema.parse(await this.repository.list(session));
  }

  markIncomingRead(session: EmployeeSession) {
    return this.repository.markIncomingRead(session);
  }

  async respond(session: EmployeeSession, requestId: string, status: "accepted" | "ignored") {
    return exchangeMutationResponseSchema.parse(await this.repository.respond(session, requestId, status));
  }
}

function snapshot(card: Awaited<ReturnType<PublicCardRepository["findPublicCard"]>>): ExchangeCardSnapshot {
  return {
    public_id: card.public_id,
    display_name: card.card.display_name,
    title: card.card.title ?? null,
    company: card.card.company ?? null,
    avatar_url: card.card.avatar_url ?? null
  };
}
