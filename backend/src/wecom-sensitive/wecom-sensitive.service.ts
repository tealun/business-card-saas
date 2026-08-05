import { randomBytes } from "node:crypto";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { EmployeeCardService } from "../employee/employee-card.service.js";
import type { EmployeeWecomSensitiveStatusResponse } from "../contracts/employee-card.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { WecomApiClientService } from "../wecom/wecom-api-client.service.js";
import { WecomConfigService } from "../wecom/wecom-config.service.js";
import { WecomSuiteTokenService } from "../wecom/wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "../wecom/wecom-tenant-auth.repository.js";
import { hashSensitiveIdentity, WecomSensitiveStateRepository } from "./wecom-sensitive-state.repository.js";

@Injectable()
export class WecomSensitiveService {
  constructor(
    private readonly config: WecomConfigService,
    private readonly states: WecomSensitiveStateRepository,
    private readonly tenants: WecomTenantAuthRepository,
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly api: WecomApiClientService,
    private readonly cards: EmployeeCardService
  ) {}

  /**
   * 为当前企业微信成员创建敏感资料授权入口。
   *
   * 仅企业微信成员身份可用；state 中保存租户、成员和哈希后的 open_userid，
   * 回调时用于确认授权人与当前名片身份一致。
   */
  async createAuthorizationUrl(session: EmployeeSession): Promise<{ authorization_url: string; expires_in: number }> {
    if (session.identityType !== "wecom_member") {
      throw new ForbiddenException("enterprise identity is required for WeCom sensitive authorization");
    }
    const tenant = await this.tenants.getByTenantId(session.tenantId);
    if (!tenant) {
      throw new ForbiddenException("enterprise application authorization is incomplete");
    }
    const state = randomBytes(18).toString("hex");
    const expiresIn = 10 * 60;
    await this.states.create(
      state,
      {
        tenantId: session.tenantId,
        memberIdentityId: session.memberIdentityId,
        openCorpid: tenant.openCorpid,
        openUseridHash: hashSensitiveIdentity(session.openUserid)
      },
      new Date(Date.now() + expiresIn * 1000)
    );

    const startUrl = new URL(this.config.sensitiveAuthorizationRedirectUri);
    startUrl.pathname = startUrl.pathname.replace(/\/callback$/, "/start");
    startUrl.search = "";
    startUrl.searchParams.set("state", state);
    return { authorization_url: startUrl.toString(), expires_in: expiresIn };
  }

  /**
   * 读取当前名片的企业微信敏感资料授权状态。
   */
  async getStatus(session: EmployeeSession): Promise<EmployeeWecomSensitiveStatusResponse> {
    return this.cards.getWecomSensitiveStatus(session);
  }

  /**
   * 生成企业微信 OAuth 授权 URL。
   *
   * 使用 snsapi_privateinfo scope，以获取手机号、邮箱、头像和二维码等敏感资料授权。
   */
  createWecomOAuthUrl(state: string): string {
    const url = new URL("https://open.weixin.qq.com/connect/oauth2/authorize");
    url.searchParams.set("appid", this.config.suite.suiteId);
    url.searchParams.set("redirect_uri", this.config.sensitiveAuthorizationRedirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "snsapi_privateinfo");
    url.searchParams.set("state", state);
    url.hash = "wechat_redirect";
    return url.toString();
  }

  /**
   * 完成企业微信敏感资料授权回调。
   *
   * 消费一次性 state，校验授权企业和成员身份，再拉取敏感资料并同步到当前员工名片。
   */
  async complete(code: string, state: string): Promise<void> {
    const context = await this.states.consume(state.trim());
    if (!context) throw new UnauthorizedException("sensitive authorization state is invalid or expired");

    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const identity = await this.api.fetchThirdPartyUserInfo(suiteToken.accessToken, code.trim());
    if (
      identity.openCorpid !== context.openCorpid ||
      hashSensitiveIdentity(identity.openUserid) !== context.openUseridHash
    ) {
      throw new ForbiddenException("authorized WeCom member does not match the current card identity");
    }
    if (!identity.userTicket) {
      throw new ForbiddenException("WeCom did not grant sensitive profile access");
    }
    const detail = await this.api.fetchThirdPartyUserDetail(suiteToken.accessToken, identity.userTicket);
    if (detail.openCorpid && detail.openCorpid !== context.openCorpid) {
      throw new ForbiddenException("sensitive profile enterprise identity mismatch");
    }
    if (!detail.name && !detail.title && !detail.mobile && !detail.email && !detail.avatarUrl && !detail.qrCodeUrl) {
      throw new ForbiddenException("WeCom did not grant profile, avatar, or QR-code access");
    }
    await this.cards.syncWecomSensitiveProfile(
      {
        accountId: "wecom-sensitive-oauth",
        identityType: "wecom_member",
        tenantId: context.tenantId,
        memberIdentityId: context.memberIdentityId,
        openUserid: identity.openUserid
      },
      {
        name: detail.name,
        title: detail.title,
        mobile: detail.mobile,
        email: detail.email,
        avatarUrl: detail.avatarUrl,
        qrCodeUrl: detail.qrCodeUrl
      }
    );
  }
}
