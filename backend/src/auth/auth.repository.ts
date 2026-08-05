import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import type { IdentitySummary } from "../contracts/auth.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { WecomMiniProgramLoginService, type WecomMiniProgramIdentity } from "../wecom/wecom-miniprogram-login.service.js";

export interface LoginIdentity {
  accountId: string;
  identityType: "personal" | "wecom_member" | "local_enterprise";
  tenantId: string;
  tenantName: string;
  memberIdentityId: string;
  displayName: string;
  openUserid: string | null;
  publicId: string;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly wecomLogin: WecomMiniProgramLoginService) {}

  /**
   * 解析企业微信小程序登录 code。
   *
   * 只负责把第三方登录结果转换为统一 LoginIdentity；账号归并和身份列表选择由上层服务处理。
   */
  async resolveQyCode(code: string): Promise<LoginIdentity> {
    const normalizedCode = code.trim();
    if (!normalizedCode) {
      throw new UnauthorizedException("invalid qy login code");
    }
    return this.fromWecomIdentity(await this.wecomLogin.resolveJsCode(normalizedCode));
  }

  /**
   * 将登录身份转换为员工会话。
   */
  toSession(identity: LoginIdentity): EmployeeSession {
    return {
      accountId: identity.accountId,
      identityType: identity.identityType,
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      memberIdentityId: identity.memberIdentityId,
      displayName: identity.displayName,
      publicId: identity.publicId,
      openUserid: identity.openUserid ?? ""
    };
  }

  /**
   * 将登录身份转换为前端可展示的身份摘要。
   */
  toSummary(identity: LoginIdentity): IdentitySummary {
    return {
      tenant_id: identity.tenantId,
      tenant_name: identity.tenantName,
      member_identity_id: identity.memberIdentityId,
      display_name: identity.displayName,
      identity_type: identity.identityType,
      open_userid: identity.openUserid,
      public_id: identity.publicId
    };
  }

  /**
   * 将企业微信登录身份映射为系统内部登录身份。
   */
  private fromWecomIdentity(identity: WecomMiniProgramIdentity): LoginIdentity {
    return {
      accountId: identity.accountId,
      identityType: "wecom_member",
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      memberIdentityId: identity.memberIdentityId,
      displayName: identity.displayName,
      openUserid: identity.openUserid,
      publicId: identity.publicId
    };
  }
}
