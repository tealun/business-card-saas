import { Module } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomAuthorizationLinkController } from "./wecom-authorization-link.controller.js";
import { WecomAuthorizationLinkService } from "./wecom-authorization-link.service.js";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomCallbackEventRepository } from "./wecom-callback-event.repository.js";
import { WecomCommandCallbackController } from "./wecom-command-callback.controller.js";
import { WecomCommandCallbackService } from "./wecom-command-callback.service.js";
import { WecomCallbackCryptoService } from "./wecom-callback-crypto.service.js";
import { WecomConfigService } from "./wecom-config.service.js";
import { WecomContactSyncRepository } from "./wecom-contact-sync.repository.js";
import { WecomContactSyncService } from "./wecom-contact-sync.service.js";
import { WecomCorpTokenService } from "./wecom-corp-token.service.js";
import { WecomDataCallbackController } from "./wecom-data-callback.controller.js";
import { WecomDataCallbackService } from "./wecom-data-callback.service.js";
import { WecomEmployeeProvisioningRepository } from "./wecom-employee-provisioning.repository.js";
import { WecomMiniProgramLoginService } from "./wecom-miniprogram-login.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

@Module({
  controllers: [WecomAuthorizationLinkController, WecomCommandCallbackController, WecomDataCallbackController],
  providers: [
    WecomCallbackEventRepository,
    WecomCallbackCryptoService,
    WecomApiClientService,
    WecomAuthorizationLinkService,
    WecomAuthorizationService,
    WecomCommandCallbackService,
    WecomConfigService,
    WecomContactSyncRepository,
    WecomContactSyncService,
    WecomCorpTokenService,
    WecomDataCallbackService,
    WecomEmployeeProvisioningRepository,
    WecomMiniProgramLoginService,
    WecomStateCipherService,
    WecomSuiteStateRepository,
    WecomSuiteTokenService,
    WecomTenantAuthRepository
  ],
  exports: [
    WecomAuthorizationLinkService,
    WecomAuthorizationService,
    WecomCallbackCryptoService,
    WecomConfigService,
    WecomContactSyncService,
    WecomCorpTokenService,
    WecomDataCallbackService,
    WecomEmployeeProvisioningRepository,
    WecomMiniProgramLoginService,
    WecomStateCipherService,
    WecomSuiteStateRepository,
    WecomSuiteTokenService,
    WecomTenantAuthRepository
  ]
})
export class WecomModule {}
