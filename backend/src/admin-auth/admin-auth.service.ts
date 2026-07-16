import { ForbiddenException, Injectable } from "@nestjs/common";
import {
  adminIdentitySchema,
  adminLoginResponseSchema,
  adminSessionMeResponseSchema,
  type AdminAuthCodeRequest,
  type AdminIdentity,
  type AdminLoginResponse,
  type AdminSessionMeResponse
} from "../contracts/admin-auth.js";
import { OwnerBootstrapRepository } from "../admin-bootstrap/owner-bootstrap.repository.js";
import { OwnerBootstrapService } from "../admin-bootstrap/owner-bootstrap.service.js";
import { WecomMiniProgramLoginService } from "../wecom/wecom-miniprogram-login.service.js";
import type { AdminSession } from "./admin-session.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { adminCapabilities } from "./admin-permissions.js";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly wecomLogin: WecomMiniProgramLoginService,
    private readonly admins: OwnerBootstrapRepository,
    private readonly sessionTokens: AdminSessionTokenService,
    private readonly ownerBootstrap: OwnerBootstrapService
  ) {}

  async qyLogin(request: AdminAuthCodeRequest): Promise<AdminLoginResponse> {
    const identity = await this.wecomLogin.resolveJsCode(request.code);
    const admin =
      (await this.admins.findActiveAdmin({
        tenantId: identity.tenantId,
        openUserid: identity.openUserid
      })) ??
      (request.claim_token
        ? await this.ownerBootstrap.claimOwner({
            tenant_id: identity.tenantId,
            claim_token: request.claim_token,
            member_identity_id: identity.memberIdentityId,
            open_userid: identity.openUserid
          })
        : null);
    if (!admin) {
      throw new ForbiddenException("WeCom user is not a tenant admin");
    }

    const session: AdminSession = {
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      memberIdentityId: admin.memberIdentityId ?? identity.memberIdentityId,
      openUserid: identity.openUserid,
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

  me(session: AdminSession): AdminSessionMeResponse {
    return adminSessionMeResponseSchema.parse({
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
