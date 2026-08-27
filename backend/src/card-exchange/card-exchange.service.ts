import { ConflictException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import {
  exchangeListResponseSchema,
  exchangeMutationResponseSchema,
  type CreateExchangeRequest,
  type ExchangeCardSnapshot,
  type ExchangeListQuery
} from "../contracts/card-exchange.js";
import type { z } from "zod";
import { exchangeNotificationEventSchema } from "../contracts/card-exchange.js";
import { AppConfig } from "../config/app-config.js";
import { WechatJoinQrService } from "../local-enterprise/wechat-join-qr.service.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";
import { VisitTokenService } from "../public-card/visit-token.service.js";
import { CardExchangeRepository } from "./card-exchange.repository.js";

@Injectable()
export class CardExchangeService {
  private readonly logger = new Logger(CardExchangeService.name);

  constructor(
    private readonly repository: CardExchangeRepository,
    private readonly publicCards: PublicCardRepository,
    private readonly visitTokens: VisitTokenService,
    private readonly config: AppConfig,
    private readonly messaging: WechatJoinQrService
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
    const result = exchangeMutationResponseSchema.parse(
      await this.repository.create(session, snapshot(sender), snapshot(recipient), visit.visitId)
    );
    if (!result.idempotent) {
      await this.notify(result.request.request_id, result.auto_accepted ? "request_accepted" : "request_received");
    }
    return result;
  }

  async list(session: EmployeeSession, query: ExchangeListQuery) {
    return exchangeListResponseSchema.parse({
      ...await this.repository.list(session, query),
      notification_template_id: this.config.wechatCardExchangeTemplateId
    });
  }

  relationship(session: EmployeeSession, counterpartPublicId: string) {
    return this.repository.relationship(session, counterpartPublicId);
  }

  markIncomingRead(session: EmployeeSession) {
    return this.repository.markIncomingRead(session);
  }

  async respond(session: EmployeeSession, requestId: string, status: "accepted" | "ignored") {
    const result = exchangeMutationResponseSchema.parse(await this.repository.respond(session, requestId, status));
    if (status === "accepted" && !result.idempotent) await this.notify(requestId, "request_accepted");
    return result;
  }

  withdraw(session: EmployeeSession, requestId: string) {
    return this.repository.withdraw(session, requestId);
  }

  subscribeNotification(session: EmployeeSession, eventType: ExchangeNotificationEvent, templateId: string) {
    if (!this.config.wechatCardExchangeTemplateId || templateId !== this.config.wechatCardExchangeTemplateId) {
      throw new ConflictException("card exchange notification template is unavailable");
    }
    return this.repository.subscribeNotification(session, eventType, templateId);
  }

  private async notify(requestId: string, eventType: ExchangeNotificationEvent) {
    let delivery: Awaited<ReturnType<CardExchangeRepository["prepareNotification"]>>;
    try {
      delivery = await this.repository.prepareNotification(requestId, eventType);
    } catch (error) {
      this.logNotificationFailure(requestId, "prepare", error);
      return;
    }
    if (!delivery) return;
    let deliveryError: string | null = null;
    try {
      await this.messaging.sendCardExchangeMessage({
        openid: delivery.openid,
        templateId: delivery.templateId,
        counterpartName: delivery.counterpartName,
        eventType
      });
    } catch (error) {
      deliveryError = error instanceof Error ? error.message.slice(0, 1000) : "unknown notification error";
      this.logNotificationFailure(delivery.deliveryId, "send", error);
    }
    try {
      await this.repository.completeNotification(delivery.deliveryId, deliveryError);
    } catch (error) {
      this.logNotificationFailure(delivery.deliveryId, "persist", error);
    }
  }

  private logNotificationFailure(reference: string, stage: string, error: unknown) {
    const message = error instanceof Error ? error.message : "unknown notification error";
    this.logger.warn(`Card exchange notification ${reference} ${stage} failed: ${message}`);
  }
}

type ExchangeNotificationEvent = z.infer<typeof exchangeNotificationEventSchema>;

function snapshot(card: Awaited<ReturnType<PublicCardRepository["findPublicCard"]>>): ExchangeCardSnapshot {
  return {
    public_id: card.public_id,
    display_name: card.card.display_name,
    title: card.card.title ?? null,
    company: card.card.company ?? null,
    avatar_url: card.card.avatar_url ?? null
  };
}
