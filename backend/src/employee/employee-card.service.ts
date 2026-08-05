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

  /**
   * 读取当前身份的员工名片。
   *
   * 读取后同步发布公开预览，确保公开名片缓存与员工端当前资料保持一致。
   */
  async getCurrentCard(session: EmployeeSession): Promise<EmployeeCardResponse> {
    const card = employeeCardResponseSchema.parse(await this.repository.getCurrentCard(session));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  /**
   * 更新当前员工名片基础资料。
   *
   * 请求先按契约 schema 校验；写入成功后重新发布公开预览，避免公开页展示旧资料。
   */
  async updateCurrentCard(session: EmployeeSession, request: UpdateEmployeeCardRequest): Promise<EmployeeCardResponse> {
    const parsed = updateEmployeeCardRequestSchema.parse(request);
    const card = employeeCardResponseSchema.parse(await this.repository.updateCurrentCard(session, parsed));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  /**
   * 更新当前员工名片启用状态。
   *
   * 状态变化也会刷新公开预览，让公开页立即反映禁用/启用结果。
   */
  async updateCurrentCardStatus(session: EmployeeSession, status: "active" | "disabled"): Promise<EmployeeCardResponse> {
    const card = employeeCardResponseSchema.parse(await this.repository.updateCurrentCardStatus(session, status));
    await this.publishPreview(await this.repository.getPreview(session));
    return card;
  }

  /**
   * 获取当前名片公开预览。
   *
   * 返回前会写入公开名片表，使员工端预览和公开访问使用同一份规范化结构。
   */
  async getPreview(session: EmployeeSession): Promise<EmployeeCardPreviewResponse> {
    return this.publishPreview(await this.repository.getPreview(session));
  }

  /**
   * 读取当前名片统计。
   *
   * 统计以当前身份为边界，个人名片和企业名片的访客数据互不混用。
   */
  async getCurrentCardStats(session: EmployeeSession): Promise<EmployeeCardStatsResponse> {
    return employeeCardStatsResponseSchema.parse(await this.repository.getCurrentCardStats(session));
  }

  /**
   * 更新当前名片样式配置。
   *
   * 样式请求单独校验和保存，成功后返回并发布新的公开预览。
   */
  async updateStyle(session: EmployeeSession, request: UpdateEmployeeCardStyleRequest): Promise<EmployeeCardPreviewResponse> {
    const parsed = updateEmployeeCardStyleRequestSchema.parse(request);
    return this.publishPreview(await this.repository.updateStyle(session, parsed));
  }

  /**
   * 获取当前身份的微信二维码配置。
   */
  async getWechatQrCode(session: EmployeeSession): Promise<EmployeeWechatQrCodeResponse> {
    return employeeWechatQrCodeResponseSchema.parse(await this.repository.getWechatQrCode(session));
  }

  /**
   * 获取企业微信敏感资料授权状态。
   *
   * 用于员工端判断是否需要引导用户授权手机号、邮箱、头像等敏感字段。
   */
  async getWecomSensitiveStatus(session: EmployeeSession): Promise<EmployeeWecomSensitiveStatusResponse> {
    return employeeWecomSensitiveStatusResponseSchema.parse(await this.repository.getWecomSensitiveStatus(session));
  }

  /**
   * 更新员工微信二维码。
   *
   * 二维码影响公开名片展示，写入后需要重新发布公开预览。
   */
  async updateWechatQrCode(session: EmployeeSession, request: UpdateWechatQrCodeRequest): Promise<EmployeeWechatQrCodeResponse> {
    const parsed = updateWechatQrCodeRequestSchema.parse(request);
    const result = employeeWechatQrCodeResponseSchema.parse(await this.repository.updateWechatQrCode(session, parsed.qrcode_url));
    await this.publishPreview(await this.repository.getPreview(session));
    return result;
  }

  /**
   * 同步企业微信敏感资料到当前名片。
   *
   * 仅在完成敏感资料授权后调用；同步后刷新公开预览，让授权资料立即生效。
   */
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

  /**
   * 创建当前名片的根分享。
   *
   * 同步公开预览、注册根分享关系，并尝试生成小程序码；小程序码失败不会阻断分享，
   * 错误会随响应返回给前端降级展示。
   */
  async createShare(session: EmployeeSession): Promise<EmployeeShareResponse> {
    const share = await this.repository.createShare(session);
    await this.publishPreview(await this.repository.getPreview(session));
    // 注册根分享，供公开页派生分享和访问归因解析（A12-P2-1）。
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

  /**
   * 发布公开名片预览。
   *
   * 先用公开名片契约规范化结构，再 upsert 到公开访问表，保证员工端和公开端字段一致。
   */
  private async publishPreview(preview: EmployeeCardPreviewResponse): Promise<EmployeeCardPreviewResponse> {
    const parsed = publicCardResponseSchema.parse(preview);
    await this.publicCards.upsertPublicCard(parsed);
    return parsed;
  }

  /**
   * 生成分享路径对应的小程序码。
   *
   * 小程序码服务可选；缺失或调用失败时返回错误文本，让主分享流程继续完成。
   */
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
