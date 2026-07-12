import { Injectable } from "@nestjs/common";
import {
  employeeCardResponseSchema,
  employeeCardStatsResponseSchema,
  employeeWechatQrCodeResponseSchema,
  employeeShareResponseSchema,
  updateEmployeeCardStyleRequestSchema,
  updateEmployeeCardRequestSchema,
  updateWechatQrCodeRequestSchema,
  type EmployeeCardPreviewResponse,
  type EmployeeCardResponse,
  type EmployeeCardStatsResponse,
  type EmployeeWechatQrCodeResponse,
  type EmployeeShareResponse,
  type UpdateEmployeeCardStyleRequest,
  type UpdateEmployeeCardRequest,
  type UpdateWechatQrCodeRequest
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

  async getCurrentCard(session: EmployeeSession): Promise<EmployeeCardResponse> {
    const card = employeeCardResponseSchema.parse(await this.repository.getCurrentCard(session));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  async updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): Promise<EmployeeCardResponse> {
    const parsed = updateEmployeeCardRequestSchema.parse(request);
    const card = employeeCardResponseSchema.parse(await this.repository.updateCurrentCard(session, parsed));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  async updateCurrentCardStatus(session: EmployeeSession, status: "active" | "disabled"): Promise<EmployeeCardResponse> {
    const card = employeeCardResponseSchema.parse(await this.repository.updateCurrentCardStatus(session, status));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  async getPreview(session: EmployeeSession): Promise<EmployeeCardPreviewResponse> {
    return this.publishPreview(await this.repository.getPreview(session));
  }

  async getCurrentCardStats(session: EmployeeSession): Promise<EmployeeCardStatsResponse> {
    return employeeCardStatsResponseSchema.parse(await this.repository.getCurrentCardStats(session));
  }

  async updateStyle(session: EmployeeSession, request: UpdateEmployeeCardStyleRequest): Promise<EmployeeCardPreviewResponse> {
    const parsed = updateEmployeeCardStyleRequestSchema.parse(request);
    return this.publishPreview(await this.repository.updateStyle(session, parsed));
  }

  async getWechatQrCode(session: EmployeeSession): Promise<EmployeeWechatQrCodeResponse> {
    return employeeWechatQrCodeResponseSchema.parse(await this.repository.getWechatQrCode(session));
  }

  async updateWechatQrCode(session: EmployeeSession, request: UpdateWechatQrCodeRequest): Promise<EmployeeWechatQrCodeResponse> {
    const parsed = updateWechatQrCodeRequestSchema.parse(request);
    const result = employeeWechatQrCodeResponseSchema.parse(await this.repository.updateWechatQrCode(session, parsed.qrcode_url));
    await this.publishPreview(await this.repository.getPreview(session));
    return result;
  }

  async createShare(session: EmployeeSession): Promise<EmployeeShareResponse> {
    const share = await this.repository.createShare(session);
    await this.publishPreview(await this.repository.getPreview(session));
    // Register the share so public derive/attribution can resolve it (A12-P2-1).
    await this.publicCards.registerRootShare({ publicId: share.publicId, shareId: share.shareId });
    return employeeShareResponseSchema.parse({
      public_id: share.publicId,
      share_id: share.shareId,
      scene: share.shareId,
      path: `/pages/public/card?card=${share.publicId}&share=${share.shareId}`
    });
  }

  private async publishPreview(preview: EmployeeCardPreviewResponse): Promise<EmployeeCardPreviewResponse> {
    const parsed = publicCardResponseSchema.parse(preview);
    await this.publicCards.upsertPublicCard(parsed);
    return parsed;
  }
}
