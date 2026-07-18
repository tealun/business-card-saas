import { randomBytes } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
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
    private readonly sessionTokens: AdminSessionTokenService
  ) {}

  async loginConfig(input: {
    clientIp: string | null;
    userAgent: string | null;
    redirectPath?: string | null;
  }): Promise<AdminWecomLoginConfigResponse> {
    const state = randomBytes(24).toString("hex");
    await this.states.create({
      state,
      context: { accountType: "tenant", redirectPath: sanitizeRedirectPath(input.redirectPath) },
      expiresAt: new Date(Date.now() + STATE_EXPIRES_IN_SECONDS * 1000),
      clientIp: input.clientIp,
      userAgent: input.userAgent
    });
    return adminWecomLoginConfigResponseSchema.parse({
      appid: this.config.suite.providerCorpId,
      redirect_uri: this.config.adminLoginRedirectUri,
      state,
      expires_in: STATE_EXPIRES_IN_SECONDS
    });
  }

  async completeScan(input: { code: string; state: string }): Promise<AdminLoginResponse> {
    const state = await this.states.consume(input.state.trim());
    if (!state) {
      throw new BadRequestException("WeCom scan login state is invalid or expired");
    }

    const suiteToken = await this.suiteTokens.getSuiteAccessToken();
    const identity = await this.api.fetchThirdPartyUserInfo(suiteToken.accessToken, input.code.trim(), {
      requireUserTicket: false
    });
    const userid = identity.userid?.trim();
    if (!userid) {
      throw new ForbiddenException("WeCom did not return an administrator userid");
    }

    const tenant = await this.tenants.getByOpenCorpid(identity.openCorpid);
    if (!tenant) {
      throw new ForbiddenException("WeCom enterprise is not installed or authorization was cancelled");
    }

    const corpToken = await this.corpTokens.getCorpAccessToken(identity.openCorpid);
    const adminList = await this.api.fetchCorpAdminList({ accessToken: corpToken.accessToken });
    const matched = adminList.admins.find((admin) => admin.userid === userid);
    if (!matched) {
      throw new ForbiddenException("WeCom user is not an enterprise administrator");
    }
    if (matched.authType !== 1) {
      throw new ForbiddenException("WeCom administrator has no management permission");
    }

    const admin = await this.scanAdmins.upsertFromScan({
      tenantId: tenant.tenantId,
      tenantName: tenant.corpName,
      userid,
      openUserid: identity.openUserid
    });
    if (admin.status === "disabled") {
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
}

function sanitizeRedirectPath(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") ? trimmed.slice(0, 256) : null;
}
