import { Module } from "@nestjs/common";
import { PublicCardModule } from "../public-card/public-card.module.js";
import { SessionModule } from "../session/session.module.js";
import { ConfigModule } from "../config/config.module.js";
import { WechatJoinQrService } from "../local-enterprise/wechat-join-qr.service.js";
import { CardExchangeController } from "./card-exchange.controller.js";
import { CardExchangeRepository } from "./card-exchange.repository.js";
import { CardExchangeService } from "./card-exchange.service.js";

@Module({
  imports: [SessionModule, PublicCardModule, ConfigModule],
  controllers: [CardExchangeController],
  providers: [CardExchangeRepository, CardExchangeService, WechatJoinQrService]
})
export class CardExchangeModule {}
