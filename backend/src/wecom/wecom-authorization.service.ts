import { BadRequestException, Injectable } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { TenantAuthorizationSnapshot, WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

@Injectable()
export class WecomAuthorizationService {
  constructor(
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository
  ) {}

  async handleAuthCode(authCode: string, authorizedAt = new Date()): Promise<TenantAuthorizationSnapshot> {
    const normalizedCode = authCode.trim();
    if (!normalizedCode) {
      throw new BadRequestException("WeCom auth_code is required");
    }

    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const authorization = await this.api.fetchPermanentCode({
      suiteAccessToken: suiteToken.accessToken,
      authCode: normalizedCode
    });

    return this.tenants.saveAuthorization({
      openCorpid: authorization.openCorpid,
      corpName: authorization.corpName,
      permanentCode: authorization.permanentCode,
      agentId: authorization.agentId,
      authInfo: authorization.authInfo,
      authorizedAt
    });
  }
}
