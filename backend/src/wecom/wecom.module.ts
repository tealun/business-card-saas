import { Module } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomAuthorizationCompleteController } from "./wecom-authorization-complete.controller.js";
import { WecomAuthorizationLinkController } from "./wecom-authorization-link.controller.js";
import { WecomAuthorizationLinkService } from "./wecom-authorization-link.service.js";
import { WecomAuthorizationService } from "./wecom-authorization.service.js";
import { WecomCallbackAlertService } from "./wecom-callback-alert.service.js";
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
import { WecomLoginCallbackController } from "./wecom-login-callback.controller.js";
import { WecomLoginCallbackService } from "./wecom-login-callback.service.js";
import { WecomMiniProgramLoginService } from "./wecom-miniprogram-login.service.js";
import { WecomStateCipherService } from "./wecom-state-cipher.service.js";
import { WecomSuiteStateRepository } from "./wecom-suite-state.repository.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";
import { WecomTenantSettingsRepository } from "./wecom-tenant-settings.repository.js";

@Module({
  controllers: [
    WecomAuthorizationCompleteController,
    WecomAuthorizationLinkController,
    WecomCommandCallbackController,
    WecomDataCallbackController,
    WecomLoginCallbackController
  ],
  providers: [
    WecomCallbackEventRepository,
    WecomCallbackAlertService,
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
    WecomLoginCallbackService,
    WecomMiniProgramLoginService,
    WecomStateCipherService,
    WecomSuiteStateRepository,
    WecomSuiteTokenService,
    WecomTenantAuthRepository,
    WecomTenantSettingsRepository
  ],
  exports: [
    WecomApiClientService,
    WecomAuthorizationLinkService,
    WecomAuthorizationService,
    WecomCallbackAlertService,
    WecomCallbackCryptoService,
    WecomConfigService,
    WecomContactSyncService,
    WecomCorpTokenService,
    WecomDataCallbackService,
    WecomEmployeeProvisioningRepository,
    WecomLoginCallbackService,
    WecomMiniProgramLoginService,
    WecomStateCipherService,
    WecomSuiteStateRepository,
    WecomSuiteTokenService,
    WecomTenantAuthRepository,
    WecomTenantSettingsRepository
  ]
})
export class WecomModule {}
