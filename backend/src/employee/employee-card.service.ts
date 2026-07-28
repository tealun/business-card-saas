import { Injectable, Optional } from "@nestjs/common";
import {
  employeeCardResponseSchema,
  employeeCardStatsResponseSchema,
  employeeWechatQrCodeResponseSchema,
  employeeWecomSensitiveStatusResponseSchema,
  employeeShareResponseSchema,
  updateEmployeeCardStyleRequestSchema,
  updateEmployeeCardRequestSchema,
  updateWechatQrCodeRequestSchema,
  type EmployeeCardPreviewResponse,
  type EmployeeCardResponse,
  type EmployeeCardStatsResponse,
  type EmployeeWechatQrCodeResponse,
  type EmployeeWecomSensitiveStatusResponse,
  type EmployeeShareResponse,
  type UpdateEmployeeCardStyleRequest,
  type UpdateEmployeeCardRequest,
  type UpdateWechatQrCodeRequest
} from "../contracts/employee-card.js";
import { publicCardResponseSchema } from "../contracts/public-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardRepository } from "./employee-card.repository.js";
import { PublicCardRepository } from "../public-card/public-card.repository.js";
import { WechatJoinQrService } from "../local-enterprise/wechat-join-qr.service.js";

@Injectable()
export class EmployeeCardService {
  constructor(
    private readonly repository: EmployeeCardRepository,
    private readonly publicCards: PublicCardRepository,
    @Optional() private readonly miniProgramCodes?: WechatJoinQrService
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

  async getWecomSensitiveStatus(session: EmployeeSession): Promise<EmployeeWecomSensitiveStatusResponse> {
    return employeeWecomSensitiveStatusResponseSchema.parse(await this.repository.getWecomSensitiveStatus(session));
  }

  async updateWechatQrCode(session: EmployeeSession, request: UpdateWechatQrCodeRequest): Promise<EmployeeWechatQrCodeResponse> {
    const parsed = updateWechatQrCodeRequestSchema.parse(request);
    const result = employeeWechatQrCodeResponseSchema.parse(await this.repository.updateWechatQrCode(session, parsed.qrcode_url));
    await this.publishPreview(await this.repository.getPreview(session));
    return result;
  }

  async syncWecomSensitiveProfile(
    session: EmployeeSession,
    profile: {
      name: string | null;
      title: string | null;
      mobile: string | null;
      email: string | null;
      avatarUrl: string | null;
      qrCodeUrl: string | null;
    }
  ): Promise<EmployeeCardResponse> {
    const card = employeeCardResponseSchema.parse(await this.repository.syncWecomSensitiveProfile(session, profile));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  async createShare(session: EmployeeSession): Promise<EmployeeShareResponse> {
    const share = await this.repository.createShare(session);
    await this.publishPreview(await this.repository.getPreview(session));
    // Register the share so public derive/attribution can resolve it (A12-P2-1).
    await this.publicCards.registerRootShare({ publicId: share.publicId, shareId: share.shareId });
    const path = `/pages/public/card?card=${share.publicId}&share=${share.shareId}`;
    const miniProgramCode = await this.generateShareCode(path);
    return employeeShareResponseSchema.parse({
      public_id: share.publicId,
      share_id: share.shareId,
      scene: share.shareId,
      path,
      qrcode_url: miniProgramCode.url,
      mini_program_code_url: miniProgramCode.url,
      qrcode_error: miniProgramCode.error
    });
  }

  private async publishPreview(preview: EmployeeCardPreviewResponse): Promise<EmployeeCardPreviewResponse> {
    const parsed = publicCardResponseSchema.parse(preview);
    await this.publicCards.upsertPublicCard(parsed);
    return parsed;
  }

  private async generateShareCode(path: string): Promise<{ url: string | null; error: string | null }> {
    if (!this.miniProgramCodes) {
      return { url: null, error: "wechat_miniprogram_code_service_unavailable" };
    }
    try {
      const url = await this.miniProgramCodes.generatePath(path);
      return { url, error: null };
    } catch (error) {
      return { url: null, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
