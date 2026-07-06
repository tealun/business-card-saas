import { Module } from "@nestjs/common";
import { WecomCommandCallbackController } from "./wecom-command-callback.controller.js";
import { WecomCommandCallbackService } from "./wecom-command-callback.service.js";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";

@Module({
  controllers: [WecomCommandCallbackController],
  providers: [
    WecomCallbackCryptoService,
    WecomCommandCallbackService,
    WecomConfigService,
    WecomStateCipherService,
    WecomSuiteStateRepository
  ],
  exports: [WecomCallbackCryptoService, WecomConfigService, WecomSuiteStateRepository]
})
export class WecomModule {}
