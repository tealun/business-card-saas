import { Module } from "@nestjs/common";
import { PublicCardController } from "./public-card.controller.js";
import { PublicCardRepository } from "./public-card.repository.js";
import { PublicCardService } from "./public-card.service.js";
import { VisitTokenService } from "./visit-token.service.js";
import { AnonIdService } from "./anon-id.service.js";
import { CardFieldCipherService } from "../admin-management/card-field-cipher.service.js";

@Module({
  controllers: [PublicCardController],
  providers: [PublicCardRepository, PublicCardService, VisitTokenService, AnonIdService, CardFieldCipherService],
  exports: [PublicCardRepository]
})
export class PublicCardModule {}
