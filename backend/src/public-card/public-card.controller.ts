import { Body, Controller, Get, Headers, Param, Post, UnauthorizedException } from "@nestjs/common";
import {
  actionRequestSchema,
  publicIdSchema,
  visitRequestSchema
} from "../contracts/public-card.js";
import { PublicCardService } from "./public-card.service.js";

@Controller("public/cards")
export class PublicCardController {
  constructor(private readonly publicCards: PublicCardService) {}

  @Get(":publicId")
  getPublicCard(@Param("publicId") publicId: string) {
    return this.publicCards.getPublicCard(publicIdSchema.parse(publicId));
  }

  @Post(":publicId/visit")
  createVisit(@Param("publicId") publicId: string, @Body() body: unknown, @Headers("user-agent") userAgent?: string) {
    const request = visitRequestSchema.parse({
      ...(typeof body === "object" && body !== null ? body : {}),
      user_agent: userAgent
    });
    return this.publicCards.createVisit(publicIdSchema.parse(publicId), request);
  }

  @Post(":publicId/actions")
  recordAction(@Param("publicId") publicId: string, @Body() body: unknown, @Headers("authorization") auth?: string) {
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("visit_token required");
    }
    const request = actionRequestSchema.parse(body);
    return this.publicCards.recordAction(publicIdSchema.parse(publicId), token, request);
  }
}
