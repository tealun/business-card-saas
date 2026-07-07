import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { IdentitySummary } from "../contracts/auth.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { WecomMiniProgramLoginService, type WecomMiniProgramIdentity } from "../wecom/wecom-miniprogram-login.service.js";

export interface LoginIdentity {
  accountId: string;
  tenantId: string;
  tenantName: string;
  memberIdentityId: string;
  displayName: string;
  openUserid: string;
  publicId: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly wecomLogin: WecomMiniProgramLoginService) {}

  async resolveQyCode(code: string): Promise<LoginIdentity> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new UnauthorizedException("invalid qy login code");
    }
    return this.fromWecomIdentity(await this.wecomLogin.resolveJsCode(normalizedCode));
  }

  toSession(identity: LoginIdentity): EmployeeSession {
    return {
      accountId: identity.accountId,
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      memberIdentityId: identity.memberIdentityId,
      displayName: identity.displayName,
      publicId: identity.publicId,
      openUserid: identity.openUserid
    };
  }

  toSummary(identity: LoginIdentity): IdentitySummary {
    return {
      tenant_id: identity.tenantId,
      tenant_name: identity.tenantName,
      member_identity_id: identity.memberIdentityId,
      display_name: identity.displayName,
      open_userid: identity.openUserid,
      public_id: identity.publicId
    };
  }

  private fromWecomIdentity(identity: WecomMiniProgramIdentity): LoginIdentity {
    return {
      accountId: identity.accountId,
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      memberIdentityId: identity.memberIdentityId,
      displayName: identity.displayName,
      openUserid: identity.openUserid,
      publicId: identity.publicId
    };
  }
}
