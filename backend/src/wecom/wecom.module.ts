import { Module } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomCommandCallbackController } from "./wecom-command-callback.controller.js";
import { WecomCommandCallbackService } from "./wecom-command-callback.service.js";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import { WecomMiniProgramLoginService } from "./wecom-miniprogram-login.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

@Module({
  controllers: [WecomCommandCallbackController],
  providers: [
    WecomCallbackCryptoService,
    WecomApiClientService,
    WecomAuthorizationService,
    WecomCommandCallbackService,
    WecomConfigService,
    WecomCorpTokenService,
    WecomMiniProgramLoginService,
    WecomStateCipherService,
    WecomSuiteStateRepository,
    WecomSuiteTokenService,
    WecomTenantAuthRepository
  ],
  exports: [
    WecomAuthorizationService,
    WecomCallbackCryptoService,
    WecomConfigService,
    WecomCorpTokenService,
    WecomMiniProgramLoginService,
    WecomSuiteStateRepository,
    WecomSuiteTokenService,
    WecomTenantAuthRepository
  ]
})
export class WecomModule {}
