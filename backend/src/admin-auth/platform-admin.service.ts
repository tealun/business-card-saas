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

  /**
   * 应用启动时按环境变量创建初始平台超级管理员。
   *
   * 仅在用户名不存在时创建，不覆盖已有账号；运营人员在控制台改密后，
   * ADMIN_BOOTSTRAP_USERNAME/PASSWORD 不再影响该账号。
   */
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
      // 常见原因是迁移尚未创建 platform_admins；不阻断启动，下一次启动会重试。
      this.logger.error(
        `super admin bootstrap skipped: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 使用用户名密码登录平台后台。
   *
   * 返回平台会话 token 和当前账号权限快照；未知用户也会执行一次密码哈希，
   * 避免响应时间泄露用户名是否存在。
   */
  async passwordLogin(request: AdminPasswordLoginRequest): Promise<AdminLoginResponse> {
    const admin = await this.admins.findByUsername(request.username);
    // 用户不存在时也执行哈希，降低用户名枚举的时序侧信道。
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

  /**
   * 创建平台管理员账号。
   *
   * 只接受 01_08 平台角色枚举；历史 owner 行由 repository 读出时归一化，
   * 新写入不再产生旧角色值。
   */
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

  /**
   * 按平台管理员 id 查询账号。
   *
   * platform_admins.id 是 BIGSERIAL，非数字路径参数直接视为不存在，
   * 避免把格式错误暴露为数据库错误。
   */
  async getAccountById(adminId: string): Promise<PlatformAdminRecord | null> {
    if (!/^\d+$/.test(adminId)) {
      return null;
    }
    return this.admins.findById(adminId);
  }

  /**
   * 更新平台管理员角色。
   *
   * `blockedUsernames` 由上层传入当前操作者和内置 owner 等受保护账号，
   * repository 会在同一条写语句中再次校验，避免检查后被并发绕过。
   */
  async updateAccountRole(
    adminId: string,
    role: PlatformAdminRole,
    blockedUsernames: string[]
  ): Promise<PlatformAdminSummary | null> {
    return this.admins.updateRoleById(adminId, role, blockedUsernames);
  }

  /**
   * 删除平台管理员账号。
   *
   * 返回是否真实删除；受保护账号同样通过 `blockedUsernames` 在写入层兜底拦截。
   */
  async deleteAccount(adminId: string, blockedUsernames: string[]): Promise<boolean> {
    return this.admins.deleteById(adminId, blockedUsernames);
  }

  /**
   * 返回内置 owner 用户名。
   *
   * 该账号由 ADMIN_BOOTSTRAP_USERNAME 指定，不能被删除或改角色。
   */
  getBootstrapUsername(): string {
    return this.config?.adminBootstrapUsername ?? process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() ?? "";
  }

  /**
   * 在每次平台请求时确认会话对应账号仍然有效。
   *
   * 由 AdminAuthGuard 调用，使禁用/删除的平台账号立即失效，而不是继续使用 8 小时 token；
   * 租户会话不在这里处理，租户侧会话撤销属于后续阶段。
   */
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

  /**
   * 修改当前平台管理员密码。
   *
   * 只支持平台用户名密码账号；企业微信扫码进入的租户管理员没有本地密码，
   * 因此不能走该接口。
   */
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

// 01_09 §4.1：owner 创建账号的密码至少 10 位且同时包含字母和数字。
// 这里在服务层校验，便于返回明确业务提示，而不是通用参数校验错误。
function assertPasswordComplexity(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new BadRequestException("密码至少 10 位，且需同时包含字母和数字");
  }
}
