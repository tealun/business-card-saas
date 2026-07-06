import { Module } from "@nestjs/common";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService } from "./wecom-config.service.js";

@Module({
  providers: [WecomCallbackCryptoService, WecomConfigService],
  exports: [WecomCallbackCryptoService, WecomConfigService]
})
export class WecomModule {}
