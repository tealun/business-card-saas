import { Injectable, UnauthorizedException } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

export interface WecomMiniProgramIdentity {
  tenantId: string;
  tenantName: string;
  openCorpid: string;
  openUserid: string;
  sessionKey: string | null;
}

@Injectable()
export class WecomMiniProgramLoginService {
  constructor(
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository
  ) {}

  async resolveJsCode(code: string): Promise<WecomMiniProgramIdentity> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new UnauthorizedException("invalid WeCom login code");
    }

    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const session = await this.api.fetchMiniProgramSession({
      suiteAccessToken: suiteToken.accessToken,
      jsCode: normalizedCode
    });
    const tenant = await this.tenants.getByOpenCorpid(session.openCorpid);
    if (!tenant) {
      throw new UnauthorizedException("WeCom tenant is not authorized");
    }

    return {
      tenantId: tenant.tenantId,
      tenantName: tenant.corpName,
      openCorpid: session.openCorpid,
      openUserid: session.openUserid,
      sessionKey: session.sessionKey
    };
  }
}
