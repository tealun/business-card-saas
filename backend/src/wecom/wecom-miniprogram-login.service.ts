import { Injectable, UnauthorizedException } from "@nestjs/common";
import { WecomApiClientService } from "./wecom-api-client.service.js";
import { WecomEmployeeProvisioningRepository } from "./wecom-employee-provisioning.repository.js";
import { WecomSuiteTokenService } from "./wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "./wecom-tenant-auth.repository.js";

export interface WecomMiniProgramIdentity {
  accountId: string;
  tenantId: string;
  tenantName: string;
  memberIdentityId: string;
  displayName: string;
  openCorpid: string;
  openUserid: string;
  publicId: string;
  sessionKey: string | null;
}

@Injectable()
export class WecomMiniProgramLoginService {
  constructor(
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository,
    private readonly employees: WecomEmployeeProvisioningRepository
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

    const employee = await this.employees.provision({
      tenantId: tenant.tenantId,
      tenantName: tenant.corpName,
      openUserid: session.openUserid
    });

    return {
      accountId: employee.accountId,
      tenantId: tenant.tenantId,
      tenantName: tenant.corpName,
      memberIdentityId: employee.memberIdentityId,
      displayName: employee.displayName,
      openCorpid: session.openCorpid,
      openUserid: session.openUserid,
      publicId: employee.publicId,
      sessionKey: session.sessionKey
    };
  }
}
