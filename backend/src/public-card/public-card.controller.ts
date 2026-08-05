import { Body, Controller, Get, Headers, Ip, Param, Post, UnauthorizedException } from "@nestjs/common";
import {
  actionRequestSchema,
  deriveShareRequestSchema,
  publicIdSchema,
  visitRequestSchema
} from "../contracts/public-card.js";
import { PublicCardService } from "./public-card.service.js";

@Controller("public/cards")
export class PublicCardController {
  constructor(private readonly publicCards: PublicCardService) {}

  /**
   * 读取公开名片。
   */
  @Get(":publicId")
  async getPublicCard(@Param("publicId") publicId: string) {
    return this.publicCards.getPublicCard(publicIdSchema.parse(publicId));
  }

  /**
   * 创建公开名片访问记录。
   *
   * 可选 Bearer 员工会话用于识别本人预览，user-agent 和 IP 用于访问归因。
   */
  @Post(":publicId/visit")
  async createVisit(
    @Param("publicId") publicId: string,
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
    @Headers("authorization") auth?: string,
    @Ip() ipAddress?: string
  ) {
    const request = visitRequestSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      user_agent: userAgent
    });
    const context: { token?: string; ipAddress?: string } = {};
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (token) {
      context.token = token;
    }
    if (ipAddress) {
      context.ipAddress = ipAddress;
    }
    return this.publicCards.createVisit(publicIdSchema.parse(publicId), request, context);
  }

  /**
   * 记录访问后的公开名片行为。
   *
   * 必须携带 visit_token，避免任意客户端绕过访问流程直接写行为。
   */
  @Post(":publicId/actions")
  async recordAction(@Param("publicId") publicId: string, @Body() body: unknown, @Headers("authorization") auth?: string) {
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("visit_token required");
    }
    const request = actionRequestSchema.parse(body);
    return this.publicCards.recordAction(publicIdSchema.parse(publicId), token, request);
  }

  /**
   * 基于当前访问派生分享链路。
   */
  @Post(":publicId/shares/derive")
  async deriveShare(@Param("publicId") publicId: string, @Body() body: unknown, @Headers("authorization") auth?: string) {
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("visit_token required");
    }
    const request = deriveShareRequestSchema.parse(body);
    return this.publicCards.deriveShare(publicIdSchema.parse(publicId), token, request);
  }
}
