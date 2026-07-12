import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
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

  @Get(":publicId")
  async getPublicCard(@Param("publicId") publicId: string) {
    return this.publicCards.getPublicCard(publicIdSchema.parse(publicId));
  }

  @Post(":publicId/visit")
  async createVisit(
    @Param("publicId") publicId: string,
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
    @Headers("authorization") auth?: string,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string
  ) {
    const request = visitRequestSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      user_agent: userAgent
    });
    const context: { token?: string; ipAddress?: string } = {};
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    const ipAddress = firstForwardedIp(forwardedFor) ?? realIp;
    if (token) {
      context.token = token;
    }
    if (ipAddress) {
      context.ipAddress = ipAddress;
    }
    return this.publicCards.createVisit(publicIdSchema.parse(publicId), request, context);
  }

  @Post(":publicId/actions")
  async recordAction(@Param("publicId") publicId: string, @Body() body: unknown, @Headers("authorization") auth?: string) {
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("visit_token required");
    }
    const request = actionRequestSchema.parse(body);
    return this.publicCards.recordAction(publicIdSchema.parse(publicId), token, request);
  }

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

function firstForwardedIp(value: string | undefined): string | undefined {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .find(Boolean);
}
