import { Module } from "@nestjs/common";
import { PublicCardModule } from "../public-card/public-card.module.js";
import { SessionModule } from "../session/session.module.js";
import { CardExchangeController } from "./card-exchange.controller.js";
import { CardExchangeRepository } from "./card-exchange.repository.js";
import { CardExchangeService } from "./card-exchange.service.js";

@Module({
  imports: [SessionModule, PublicCardModule],
  controllers: [CardExchangeController],
  providers: [CardExchangeRepository, CardExchangeService]
})
export class CardExchangeModule {}
