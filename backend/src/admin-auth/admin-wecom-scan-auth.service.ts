import { randomBytes } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";
import {
  adminIdentitySchema,
  adminLoginResponseSchema,
  adminWecomLoginConfigResponseSchema,
  type AdminIdentity,
  type AdminLoginResponse,
  type AdminWecomLoginConfigResponse
} from "../contracts/admin-auth.js";
import { WecomApiClientService } from "../wecom/wecom-api-client.service.js";
import { WecomConfigService } from "../wecom/wecom-config.service.js";
import { WecomCorpTokenService } from "../wecom/wecom-corp-token.service.js";
import { WecomSuiteTokenService } from "../wecom/wecom-suite-token.service.js";
import { WecomTenantAuthRepository } from "../wecom/wecom-tenant-auth.repository.js";
import { adminCapabilities } from "./admin-permissions.js";
import type { AdminSession } from "./admin-session.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { AdminWecomAuthStateRepository } from "./admin-wecom-auth-state.repository.js";
import { AdminWecomScanRepository } from "./admin-wecom-scan.repository.js";

const STATE_EXPIRES_IN_SECONDS = 10 * 60;

@Injectable()
export class AdminWecomScanAuthService {
  constructor(
    private readonly config: WecomConfigService,
    private readonly states: AdminWecomAuthStateRepository,
    private readonly suiteTokens: WecomSuiteTokenService,
    private readonly corpTokens: WecomCorpTokenService,
    private readonly api: WecomApiClientService,
    private readonly tenants: WecomTenantAuthRepository,
    private readonly scanAdmins: AdminWecomScanRepository,
    private readonly sessionTokens: AdminSessionTokenService,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  async loginConfig(input: {
    clientIp: string | null;
    userAgent: string | null;
    redirectPath?: string | null;
  }): Promise<AdminWecomLoginConfigResponse> {
    const state = randomBytes(24).toString("hex");
    const loginConfig = this.readLoginConfig();
    await this.states.create({
      state,
      context: { accountType: "tenant", redirectPath: sanitizeRedirectPath(input.redirectPath) },
      expiresAt: new Date(Date.now() + STATE_EXPIRES_IN_SECONDS * 1000),
      clientIp: input.clientIp,
      userAgent: input.userAgent
    });
    return adminWecomLoginConfigResponseSchema.parse({
      appid: loginConfig.suiteId,
      redirect_uri: loginConfig.redirectUri,
      login_url: buildWecomLoginUrl({
        suiteId: loginConfig.suiteId,
        redirectUri: loginConfig.redirectUri,
        state
      }),
      state,
      expires_in: STATE_EXPIRES_IN_SECONDS
    });
  }

  private readLoginConfig(): { suiteId: string; redirectUri: string } {
    try {
      const config = {
        suiteId: this.config.suiteId,
        redirectUri: this.config.adminLoginRedirectUri
      };
      if (!config.suiteId.trim() || !config.redirectUri.trim()) {
        throw new Error("missing scan login config");
      }
      return config;
    } catch {
      throw new ServiceUnavailableException(
        "企业微信扫码登录配置未完成，请检查 WECOM_SUITE_ID 和 WECOM_ADMIN_LOGIN_REDIRECT_URI"
      );
    }
  }

  async completeScan(input: { code: string; state: string; clientIp?: string | null }): Promise<AdminLoginResponse> {
    const state = await this.states.consume(input.state.trim());
    if (!state) {
      throw new BadRequestException("WeCom scan login state is invalid or expired");
    }

    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const identity = await this.api.fetchThirdPartyUserInfo(suiteToken.accessToken, input.code.trim(), {
      requireUserTicket: false
    });
    const userid = identity.userid?.trim();
    const tenant = await this.tenants.getByOpenCorpid(identity.openCorpid);
    if (!tenant) {
      throw new ForbiddenException("WeCom enterprise is not installed or authorization was cancelled");
    }
    if (!userid) {
      await this.recordScanLoginFailure({
        tenantId: tenant.tenantId,
        actorOpenUserid: identity.openUserid,
        reason: "missing_userid",
        openCorpid: identity.openCorpid,
        clientIp: input.clientIp ?? null
      });
      throw new ForbiddenException("WeCom did not return an administrator userid");
    }

    const corpToken = await this.corpTokens.getCorpAccessToken(identity.openCorpid);
    const adminList = await this.api.fetchCorpAdminList({ accessToken: corpToken.accessToken });
    const matched = adminList.admins.find((admin) => admin.userid === userid);
    if (!matched) {
      await this.recordScanLoginFailure({
        tenantId: tenant.tenantId,
        actorOpenUserid: identity.openUserid,
        reason: "not_enterprise_admin",
        userid,
        openCorpid: identity.openCorpid,
        clientIp: input.clientIp ?? null
      });
      throw new ForbiddenException("WeCom user is not an enterprise administrator");
    }
    if (matched.authType !== 1) {
      await this.recordScanLoginFailure({
        tenantId: tenant.tenantId,
        actorOpenUserid: identity.openUserid,
        reason: "no_management_permission",
        userid,
        openCorpid: identity.openCorpid,
        authType: matched.authType,
        clientIp: input.clientIp ?? null
      });
      throw new ForbiddenException("WeCom administrator has no management permission");
    }

    const admin = await this.scanAdmins.upsertFromScan({
      tenantId: tenant.tenantId,
      tenantName: tenant.corpName,
      userid,
      openUserid: identity.openUserid
    });
    if (admin.status === "disabled") {
      await this.recordScanLoginFailure({
        tenantId: tenant.tenantId,
        actorOpenUserid: admin.openUserid,
        reason: "local_admin_disabled",
        userid,
        openCorpid: identity.openCorpid,
        clientIp: input.clientIp ?? null
      });
      throw new ForbiddenException("Local administrator account is disabled");
    }

    const session: AdminSession = {
      tenantId: admin.tenantId,
      tenantName: admin.tenantName,
      memberIdentityId: admin.memberIdentityId,
      openUserid: admin.openUserid,
      role: admin.role,
      accountType: "tenant"
    };
    await this.operationLogs?.record({
      session: input.clientIp ? { ...session, requestIp: input.clientIp } : session,
      action: "admin.login.wecom_scan.success",
      targetType: "tenant_admin",
      targetId: admin.openUserid,
      detail: { open_corpid: identity.openCorpid, userid }
    });
    return adminLoginResponseSchema.parse({
      access_token: this.sessionTokens.sign(session),
      token_type: "Bearer",
      expires_in: this.sessionTokens.expiresIn,
      admin: this.toIdentity(session)
    });
  }

  private toIdentity(session: AdminSession): AdminIdentity {
    const capabilities = adminCapabilities(session);
    return adminIdentitySchema.parse({
      tenant_id: session.tenantId,
      tenant_name: session.tenantName,
      member_identity_id: session.memberIdentityId,
      open_userid: session.openUserid,
      role: session.role,
      account_type: session.accountType ?? "tenant",
      permissions: capabilities.permissions,
      menu_scopes: capabilities.menuScopes
    });
  }

  private async recordScanLoginFailure(input: {
    tenantId: string;
    actorOpenUserid: string | null;
    reason: string;
    openCorpid: string;
    userid?: string | undefined;
    authType?: 0 | 1 | undefined;
    clientIp: string | null;
  }): Promise<void> {
    await this.operationLogs?.recordLoginAttempt({
      tenantId: input.tenantId,
      actorOpenUserid: input.actorOpenUserid,
      actorRole: "unknown",
      accountType: "tenant",
      action: "admin.login.wecom_scan.failed",
      targetType: "tenant_admin",
      targetId: input.userid ?? input.actorOpenUserid ?? null,
      detail: {
        reason: input.reason,
        open_corpid: input.openCorpid,
        userid: input.userid ?? null,
        auth_type: input.authType ?? null
      },
      ip: input.clientIp
    });
  }
}

function sanitizeRedirectPath(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") ? trimmed.slice(0, 256) : null;
}

function buildWecomLoginUrl(input: { suiteId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://login.work.weixin.qq.com/wwlogin/sso/login");
  url.searchParams.set("login_type", "ServiceApp");
  url.searchParams.set("appid", input.suiteId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("lang", "zh");
  return url.toString();
}
