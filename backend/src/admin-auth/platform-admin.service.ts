import { BadRequestException, ConflictException, Injectable, Logger, OnApplicationBootstrap, Optional, UnauthorizedException } from "@nestjs/common";
import {
  adminIdentitySchema,
  adminLoginResponseSchema,
  type AdminChangePasswordRequest,
  type AdminLoginResponse,
  type AdminPasswordLoginRequest,
  type PlatformAdminRole
} from "../contracts/admin-auth.js";
import type { PlatformAdminSummary } from "../contracts/admin-observability.js";
import { AppConfig } from "../config/app-config.js";
import type { AdminSession } from "./admin-session.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { adminCapabilities } from "./admin-permissions.js";
import { hashPassword, verifyPassword } from "./password.util.js";
import { PlatformAdminRepository, PlatformUsernameTakenError, type PlatformAdminRecord } from "./platform-admin.repository.js";

const PLATFORM_USER_PREFIX = "platform:";
const PLATFORM_USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,64}$/;
const PASSWORD_MIN_LENGTH = 10;

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
      role: admin.role,
      accountType: "platform"
    };
    const capabilities = adminCapabilities(session);
    return adminLoginResponseSchema.parse({
      access_token: this.sessionTokens.sign(session),
      token_type: "Bearer",
      expires_in: this.sessionTokens.expiresIn,
      admin: adminIdentitySchema.parse({
        tenant_id: session.tenantId,
        tenant_name: session.tenantName,
        member_identity_id: session.memberIdentityId,
        open_userid: session.openUserid,
        role: session.role,
        account_type: "platform",
        permissions: capabilities.permissions,
        menu_scopes: capabilities.menuScopes
      })
    });
  }

  // M1-S4 (01_09 §4.1): platform account management. Writes use only the new
  // 01_08 role enum; legacy 'owner' rows are normalized on read in the repository.
  async createPlatformAccount(input: {
    username: string;
    password: string;
    role: PlatformAdminRole;
    createdBy: string;
  }): Promise<PlatformAdminSummary> {
    const username = input.username.trim();
    if (!PLATFORM_USERNAME_PATTERN.test(username)) {
      throw new BadRequestException("用户名需为 3-64 位，只能包含字母、数字、下划线、点和短横线");
    }
    assertPasswordComplexity(input.password);
    try {
      const created = await this.admins.createAccount({
        username,
        passwordHash: hashPassword(input.password),
        role: input.role,
        createdBy: input.createdBy
      });
      this.logger.warn(`platform admin '${username}' created by '${input.createdBy}' with role '${input.role}'`);
      return created;
    } catch (error) {
      if (error instanceof PlatformUsernameTakenError) {
        throw new ConflictException("用户名已存在");
      }
      throw error;
    }
  }

  async getAccountById(adminId: string): Promise<PlatformAdminRecord | null> {
    // platform_admins.id is BIGSERIAL; a non-numeric path param is simply not found.
    if (!/^\d+$/.test(adminId)) {
      return null;
    }
    return this.admins.findById(adminId);
  }

  async updateAccountRole(
    adminId: string,
    role: PlatformAdminRole,
    blockedUsernames: string[]
  ): Promise<PlatformAdminSummary | null> {
    return this.admins.updateRoleById(adminId, role, blockedUsernames);
  }

  async deleteAccount(adminId: string, blockedUsernames: string[]): Promise<boolean> {
    return this.admins.deleteById(adminId, blockedUsernames);
  }

  // The built-in owner (env ADMIN_BOOTSTRAP_USERNAME) can neither be deleted nor
  // re-roled (01_09 §4.1).
  getBootstrapUsername(): string {
    return this.config?.adminBootstrapUsername ?? process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() ?? "";
  }

  // M1-S7 (01_09 AC6): invoked by AdminAuthGuard on every platform request so a
  // disabled or deleted account loses access immediately instead of living out
  // its 8h token. Tenant sessions are unaffected: the wecom scan flow
  // re-validates admin status at login, and tenant-side session revocation is M2.
  async assertActiveSessionAccount(session: AdminSession): Promise<void> {
    if (!session.openUserid.startsWith(PLATFORM_USER_PREFIX)) {
      return;
    }
    const username = session.openUserid.slice(PLATFORM_USER_PREFIX.length);
    const admin = await this.admins.findByUsername(username);
    if (!admin || admin.status !== "active") {
      throw new UnauthorizedException("平台账号已被禁用或删除，请重新登录");
    }
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

// 01_09 §4.1 password policy for owner-created accounts: at least 10 characters
// containing both letters and digits. Enforced here (not in zod) so violations
// return this curated message instead of the generic validation payload.
function assertPasswordComplexity(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException("密码至少 10 位，且需同时包含字母和数字");
  }
}
