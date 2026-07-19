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

  // 企业微信内同时携带 wx.login code 时，把企业身份归并进该微信个人账号，
  // 让企业/微信两个入口共享同一份身份列表。归并失败不阻断企业登录。
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

  async wxLogin(request: AuthCodeRequest): Promise<QyLoginResponse> {
    const wxSession = await this.wxMiniProgramLogin.resolveJsCode(request.code);
    const { current, identities } = await this.personalIdentities.provisionFromWxSession(wxSession);
    return this.loginResponse(current, identities);
  }

  async listIdentities(session: EmployeeSession) {
    return {
      current_identity: this.repository.toSummary(sessionToIdentity(session)),
      identities: (await this.personalIdentities.listAccountIdentities(session.accountId)).map((identity) =>
        this.repository.toSummary(identity)
      )
    };
  }

  async switchIdentity(session: EmployeeSession, request: SwitchIdentityRequest): Promise<QyLoginResponse> {
    const { current, identities } = await this.personalIdentities.switchIdentity(
      session.accountId,
      request.member_identity_id
    );
    return this.loginResponse(current, identities);
  }

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
