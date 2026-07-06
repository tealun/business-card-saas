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
import { WecomMiniProgramLoginService } from "../wecom/wecom-miniprogram-login.service.js";
import type { AdminSession } from "./admin-session.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly wecomLogin: WecomMiniProgramLoginService,
    private readonly admins: OwnerBootstrapRepository,
    private readonly sessionTokens: AdminSessionTokenService
  ) {}

  async qyLogin(request: AdminAuthCodeRequest): Promise<AdminLoginResponse> {
    const identity = await this.wecomLogin.resolveJsCode(request.code);
    const admin = await this.admins.findActiveAdmin({
      tenantId: identity.tenantId,
      openUserid: identity.openUserid
    });
    if (!admin) {
      throw new ForbiddenException("WeCom user is not a tenant admin");
    }

    const session: AdminSession = {
      tenantId: identity.tenantId,
      tenantName: identity.tenantName,
      memberIdentityId: admin.memberIdentityId ?? identity.memberIdentityId,
      openUserid: identity.openUserid,
      role: admin.role
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
    return adminIdentitySchema.parse({
      tenant_id: session.tenantId,
      tenant_name: session.tenantName,
      member_identity_id: session.memberIdentityId,
      open_userid: session.openUserid,
      role: session.role
    });
  }
}
