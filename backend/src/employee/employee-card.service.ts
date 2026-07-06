import { Injectable } from "@nestjs/common";
import {
  employeeCardResponseSchema,
  employeeShareResponseSchema,
  updateEmployeeCardStyleRequestSchema,
  updateEmployeeCardRequestSchema,
  type EmployeeCardPreviewResponse,
  type EmployeeCardResponse,
  type EmployeeShareResponse,
  type UpdateEmployeeCardStyleRequest,
  type UpdateEmployeeCardRequest
} from "../contracts/employee-card.js";
import { publicCardResponseSchema } from "../contracts/public-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardRepository } from "./employee-card.repository.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";

@Injectable()
export class EmployeeCardService {
  constructor(
    private readonly repository: EmployeeCardRepository,
    private readonly publicCards: PublicCardRepository
  ) {}

  getCurrentCard(session: EmployeeSession): EmployeeCardResponse {
    const card = employeeCardResponseSchema.parse(this.repository.getCurrentCard(session));
    this.publishPreview(this.repository.getPreview(session));
    return card;
  }

  updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): EmployeeCardResponse {
    const parsed = updateEmployeeCardRequestSchema.parse(request);
    const card = employeeCardResponseSchema.parse(this.repository.updateCurrentCard(session, parsed));
    this.publishPreview(this.repository.getPreview(session));
    return card;
  }

  updateCurrentCardStatus(session: EmployeeSession, status: "active" | "disabled"): EmployeeCardResponse {
    const card = employeeCardResponseSchema.parse(this.repository.updateCurrentCardStatus(session, status));
    this.publishPreview(this.repository.getPreview(session));
    return card;
  }

  getPreview(session: EmployeeSession): EmployeeCardPreviewResponse {
    return this.publishPreview(this.repository.getPreview(session));
  }

  updateStyle(session: EmployeeSession, request: UpdateEmployeeCardStyleRequest): EmployeeCardPreviewResponse {
    const parsed = updateEmployeeCardStyleRequestSchema.parse(request);
    return this.publishPreview(this.repository.updateStyle(session, parsed));
  }

  createShare(session: EmployeeSession): EmployeeShareResponse {
    const share = this.repository.createShare(session);
    this.publishPreview(this.repository.getPreview(session));
    // Register the share so public derive/attribution can resolve it (A12-P2-1).
    this.publicCards.registerRootShare({ publicId: share.publicId, shareId: share.shareId });
    return employeeShareResponseSchema.parse({
      public_id: share.publicId,
      share_id: share.shareId,
      scene: share.shareId,
      path: `/pages/public/card?card=${share.publicId}&share=${share.shareId}`
    });
  }

  private publishPreview(preview: EmployeeCardPreviewResponse): EmployeeCardPreviewResponse {
    const parsed = publicCardResponseSchema.parse(preview);
    this.publicCards.upsertPublicCard(parsed);
    return parsed;
  }
}
