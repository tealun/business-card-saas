import { Injectable } from "@nestjs/common";
import {
  qyLoginResponseSchema,
  type AuthCodeRequest,
  type QyLoginRequest,
  type QyLoginResponse,
  type SwitchIdentityRequest
} from "../contracts/auth.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { SessionTokenService } from "../session/session-token.service.js";
import { AuthRepository, type LoginIdentity } from "./auth.repository.js";
import { PersonalIdentityRepository } from "./personal-identity.repository.js";
import { WxMiniProgramLoginService } from "./wx-miniprogram-login.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly sessionTokens: SessionTokenService,
    private readonly wxMiniProgramLogin: WxMiniProgramLoginService,
    private readonly personalIdentities: PersonalIdentityRepository
  ) {}

  /**
   * 企业微信成员登录。
   *
   * 先解析企业微信 code 得到企业成员身份；若同时带有 wx_code，则尝试把企业身份归并到
   * 同一个微信个人账号，归并失败不阻断企业登录。
   */
  async qyLogin(request: QyLoginRequest): Promise<QyLoginResponse> {
    const identity = await this.repository.resolveQyCode(request.code);
    const linkedAccountId = request.wx_code ? await this.tryLinkWxAccount(identity, request.wx_code) : null;
    const accountId = linkedAccountId ?? identity.accountId;
    const boundIdentity = { ...identity, accountId };
    const { current, identities } = await this.personalIdentities.loginAccountIdentity(
      accountId,
      boundIdentity
    );
    return this.loginResponse(current, identities);
  }

  /**
   * 尝试把企业微信身份归并到微信个人账号。
   *
   * 企业微信内同时携带 wx.login code 时执行；失败时返回 null，
   * 让企业登录继续完成，避免第三方接口波动阻断主流程。
   */
  private async tryLinkWxAccount(identity: LoginIdentity, wxCode: string): Promise<string | null> {
    try {
      const wxSession = await this.wxMiniProgramLogin.resolveJsCode(wxCode);
      const { current } = await this.personalIdentities.provisionFromWxSession(wxSession);
      return await this.personalIdentities.adoptWecomIdentity({
        wxAccountId: current.accountId,
        tenantId: identity.tenantId,
        memberIdentityId: identity.memberIdentityId
      });
    } catch {
      return null;
    }
  }

  /**
   * 微信个人账号登录。
   *
   * 根据 wx.login code 获取微信会话，并创建或读取该个人账号下的身份列表。
   */
  async wxLogin(request: AuthCodeRequest): Promise<QyLoginResponse> {
    const wxSession = await this.wxMiniProgramLogin.resolveJsCode(request.code);
    const { current, identities } = await this.personalIdentities.provisionFromWxSession(wxSession);
    return this.loginResponse(current, identities);
  }

  /**
   * 列出当前账号可切换身份。
   *
   * 当前身份来自会话，身份列表来自账号维度绑定关系；返回前统一转换为前端摘要结构。
   */
  async listIdentities(session: EmployeeSession) {
    const preferred = await this.personalIdentities.preferredAccountIdentity(
      session.accountId,
      session.memberIdentityId
    );
    const current = preferred.current ?? sessionToIdentity(session);
    return {
      current_identity: this.repository.toSummary(current),
      identities: preferred.identities.map((identity) =>
        this.repository.toSummary(identity)
      )
    };
  }

  /**
   * 切换当前账号下的名片身份。
   *
   * 只能切换到同一账号已绑定的 member_identity_id，成功后重新签发会话 token。
   */
  async switchIdentity(session: EmployeeSession, request: SwitchIdentityRequest): Promise<QyLoginResponse> {
    const { current, identities } = await this.personalIdentities.switchIdentity(
      session.accountId,
      request.member_identity_id
    );
    return this.loginResponse(current, identities);
  }

  /**
   * 组装登录响应。
   *
   * 把当前身份签入短期会话 token，并返回当前账号下可切换身份列表；
   * 当列表为空时至少返回当前身份，保证小程序端有稳定展示入口。
   */
  private loginResponse(identity: LoginIdentity, identities: LoginIdentity[]): QyLoginResponse {
    const summaries = identities.map((item) => this.repository.toSummary(item));
    return qyLoginResponseSchema.parse({
      access_token: this.sessionTokens.sign(this.repository.toSession(identity)),
      token_type: "Bearer",
      expires_in: this.sessionTokens.expiresIn,
      account: {
        account_id: identity.accountId,
        status: "active"
      },
      current_identity: this.repository.toSummary(identity),
      identities: summaries.length ? summaries : [this.repository.toSummary(identity)]
    });
  }
}

function sessionToIdentity(session: EmployeeSession) {
  return {
    accountId: session.accountId,
    identityType: session.identityType ?? "wecom_member",
    tenantId: session.tenantId,
    tenantName: session.tenantName ?? "",
    memberIdentityId: session.memberIdentityId,
    displayName: session.displayName ?? "",
    openUserid: session.openUserid || null,
    publicId: session.publicId ?? ""
  } satisfies LoginIdentity;
}
