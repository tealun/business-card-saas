import { BadRequestException, Injectable, Logger, OnApplicationBootstrap, Optional, UnauthorizedException } from "@nestjs/common";
import {
  adminIdentitySchema,
  adminLoginResponseSchema,
  type AdminChangePasswordRequest,
  type AdminLoginResponse,
  type AdminPasswordLoginRequest
} from "../contracts/admin-auth.js";
import { AppConfig } from "../config/app-config.js";
import type { AdminSession } from "./admin-session.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { hashPassword, verifyPassword } from "./password.util.js";
import { PlatformAdminRepository } from "./platform-admin.repository.js";

const PLATFORM_USER_PREFIX = "platform:";

@Injectable()
export class PlatformAdminService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PlatformAdminService.name);

  constructor(
    private readonly admins: PlatformAdminRepository,
    private readonly sessionTokens: AdminSessionTokenService,
    @Optional() private readonly config?: AppConfig
  ) {}

  // Creates the initial super admin from ADMIN_BOOTSTRAP_USERNAME/PASSWORD.
  // Never overwrites an existing account: once the operator changes the
  // password in the console, the env value stops mattering.
  async onApplicationBootstrap(): Promise<void> {
    const username = this.config?.adminBootstrapUsername ?? process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() ?? "";
    const password = this.config?.adminBootstrapPassword ?? process.env.ADMIN_BOOTSTRAP_PASSWORD ?? "";
    if (!username || !password) {
      return;
    }
    try {
      const existing = await this.admins.findByUsername(username);
      if (existing) {
        return;
      }
      await this.admins.createWithBootstrapTenant({
        username,
        passwordHash: hashPassword(password),
        tenantName: "平台运营"
      });
      this.logger.warn(`bootstrap super admin '${username}' created; change its password in the console`);
    } catch (error) {
      // Most likely the platform_admins table is missing because migrations
      // have not run yet. Do not block startup; bootstrap retries next start.
      this.logger.error(
        `super admin bootstrap skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async passwordLogin(request: AdminPasswordLoginRequest): Promise<AdminLoginResponse> {
    const admin = await this.admins.findByUsername(request.username);
    // Hash even when the user is unknown so response timing does not reveal
    // whether a username exists.
    const valid = admin
      ? verifyPassword(request.password, admin.passwordHash)
      : (hashPassword(request.password), false);
    if (!admin || !valid || admin.status !== "active") {
      throw new UnauthorizedException("invalid username or password");
    }

    const session: AdminSession = {
      tenantId: admin.tenantId,
      tenantName: admin.tenantName,
      memberIdentityId: null,
      openUserid: `${PLATFORM_USER_PREFIX}${admin.username}`,
      role: admin.role
    };
    return adminLoginResponseSchema.parse({
      access_token: this.sessionTokens.sign(session),
      token_type: "Bearer",
      expires_in: this.sessionTokens.expiresIn,
      admin: adminIdentitySchema.parse({
        tenant_id: session.tenantId,
        tenant_name: session.tenantName,
        member_identity_id: session.memberIdentityId,
        open_userid: session.openUserid,
        role: session.role
      })
    });
  }

  async changePassword(session: AdminSession, request: AdminChangePasswordRequest): Promise<void> {
    if (!session.openUserid.startsWith(PLATFORM_USER_PREFIX)) {
      throw new BadRequestException("password login is not enabled for this account");
    }
    const username = session.openUserid.slice(PLATFORM_USER_PREFIX.length);
    const admin = await this.admins.findByUsername(username);
    if (!admin || !verifyPassword(request.old_password, admin.passwordHash)) {
      throw new UnauthorizedException("current password is incorrect");
    }
    const updated = await this.admins.updatePassword(username, hashPassword(request.new_password));
    if (!updated) {
      throw new BadRequestException("password update failed");
    }
    this.logger.warn(`platform admin '${username}' changed password`);
  }
}
