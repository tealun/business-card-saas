import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { AdminRole, PlatformAdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole, requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import { PlatformAdminService } from "../admin-auth/platform-admin.service.js";
import {
  adminEventListResponseSchema,
  platformAccountDeleteResponseSchema,
  type AdminEventListResponse,
  type AdminEventQuery,
  type AdminListQuery,
  type PlatformAccountCreateRequest,
  type PlatformAccountDeleteResponse,
  platformAdminListResponseSchema,
  type PlatformAdminListResponse,
  platformAdminSummarySchema,
  type PlatformAdminSummary,
  tenantAdminListResponseSchema,
  tenantAdminSummarySchema,
  type TenantAdminListResponse,
  type TenantAdminSummary
} from "../contracts/admin-observability.js";
import { AdminObservabilityRepository } from "./admin-observability.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";

const PLATFORM_USER_PREFIX = "platform:";

@Injectable()
export class AdminObservabilityService {
  constructor(
    private readonly repository: AdminObservabilityRepository,
    private readonly platformAdmins: PlatformAdminService,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  async listTenantAdmins(session: AdminSession, query: AdminListQuery): Promise<TenantAdminListResponse> {
    requireTenantAdminRole(session, "owner");
    return tenantAdminListResponseSchema.parse(await this.repository.listTenantAdmins(session, query));
  }

  async updateTenantAdminStatus(session: AdminSession, adminId: string, status: "active" | "disabled"): Promise<TenantAdminSummary> {
    requireTenantAdminRole(session, "owner");
    const target = await this.repository.getTenantAdmin(session, adminId);
    if (!target) {
      throw new NotFoundException("tenant admin not found");
    }
    if (
      target.open_userid === session.openUserid ||
      (target.member_identity_id !== null && target.member_identity_id === session.memberIdentityId)
    ) {
      throw new ForbiddenException("cannot change own admin status");
    }
    if (target.role === "owner") {
      throw new ForbiddenException("cannot change owner admin status");
    }
    const updated = await this.repository.updateTenantAdminStatus(session, adminId, status);
    if (!updated) {
      throw new NotFoundException("tenant admin not found");
    }
    const summary = tenantAdminSummarySchema.parse(updated);
    await this.operationLogs?.record({
      session,
      action: "admin.status.update",
      targetType: "tenant_admin",
      targetId: adminId,
      detail: { status }
    });
    return summary;
  }

  async listPlatformAdmins(session: AdminSession, query: AdminListQuery): Promise<PlatformAdminListResponse> {
    requirePlatformAdminRole(session, "owner");
    return platformAdminListResponseSchema.parse(await this.repository.listPlatformAdmins(query));
  }

  async updatePlatformAdminStatus(
    session: AdminSession,
    adminId: string,
    status: "active" | "disabled"
  ): Promise<PlatformAdminSummary> {
    requirePlatformAdminRole(session, "owner");
    const currentUsername = session.openUserid.startsWith(PLATFORM_USER_PREFIX)
      ? session.openUserid.slice(PLATFORM_USER_PREFIX.length)
      : session.openUserid;
    const target = await this.platformAdmins.getAccountById(adminId);
    if (!target) {
      throw new NotFoundException("platform admin not found");
    }
    if (target.username === currentUsername) {
      throw new ForbiddenException("不能修改当前登录账号状态");
    }
    const bootstrapUsername = this.platformAdmins.getBootstrapUsername();
    if (bootstrapUsername && target.username === bootstrapUsername) {
      throw new ForbiddenException("内置平台 Owner 账号禁止启停");
    }
    const updated = await this.repository.updatePlatformAdminStatus(
      adminId,
      status,
      [...new Set([currentUsername, bootstrapUsername].filter((name) => Boolean(name)))]
    );
    if (!updated) {
      throw new ConflictException("平台账号状态已变化，请刷新后重试");
    }
    const summary = platformAdminSummarySchema.parse(updated);
    await this.operationLogs?.record({
      session,
      action: "platform.account.status.update",
      targetType: "platform_admin",
      targetId: adminId,
      detail: { status }
    });
    return summary;
  }

  // M1-S4 (01_09 §4.1): platform account management. All three operations are
  // platform_owner-only and write admin_operation_logs; the built-in owner
  // (env ADMIN_BOOTSTRAP_USERNAME) is protected from role changes and deletion.
  async createPlatformAccount(session: AdminSession, input: PlatformAccountCreateRequest): Promise<PlatformAdminSummary> {
    requirePlatformAdminRole(session, "owner");
    const summary = await this.platformAdmins.createPlatformAccount({
      ...input,
      createdBy: platformActorUsername(session)
    });
    await this.operationLogs?.record({
      session,
      action: "platform.account.create",
      targetType: "platform_admin",
      targetId: summary.admin_id,
      detail: { username: summary.username, role: summary.role }
    });
    return summary;
  }

  async updatePlatformAccountRole(session: AdminSession, adminId: string, role: "ops" | "support"): Promise<PlatformAdminSummary> {
    requirePlatformAdminRole(session, "owner");
    const target = await this.platformAdmins.getAccountById(adminId);
    if (!target) {
      throw new NotFoundException("平台账号不存在");
    }
    const bootstrapUsername = this.platformAdmins.getBootstrapUsername();
    if (bootstrapUsername && target.username === bootstrapUsername) {
      throw new ForbiddenException("内置平台 Owner 账号禁止修改角色");
    }
    const updated = await this.platformAdmins.updateAccountRole(
      adminId,
      role,
      bootstrapUsername ? [bootstrapUsername] : []
    );
    if (!updated) {
      // The pre-check passed but the guarded write did not: the target changed
      // underneath us (renamed to a protected name or removed concurrently).
      throw new ConflictException("平台账号状态已变化，请刷新后重试");
    }
    await this.operationLogs?.record({
      session,
      action: "platform.account.role.update",
      targetType: "platform_admin",
      targetId: adminId,
      detail: { username: updated.username, role }
    });
    return updated;
  }

  async deletePlatformAccount(session: AdminSession, adminId: string): Promise<PlatformAccountDeleteResponse> {
    requirePlatformAdminRole(session, "owner");
    const target = await this.platformAdmins.getAccountById(adminId);
    if (!target) {
      throw new NotFoundException("平台账号不存在");
    }
    const currentUsername = platformActorUsername(session);
    if (target.username === currentUsername) {
      throw new ForbiddenException("不能删除当前登录的账号");
    }
    const bootstrapUsername = this.platformAdmins.getBootstrapUsername();
    if (bootstrapUsername && target.username === bootstrapUsername) {
      throw new ForbiddenException("内置平台 Owner 账号禁止删除");
    }
    const deleted = await this.platformAdmins.deleteAccount(
      adminId,
      [...new Set([currentUsername, bootstrapUsername].filter((name) => Boolean(name)))]
    );
    if (!deleted) {
      throw new ConflictException("平台账号状态已变化，请刷新后重试");
    }
    await this.operationLogs?.record({
      session,
      action: "platform.account.delete",
      targetType: "platform_admin",
      targetId: adminId,
      detail: { username: target.username, role: target.role }
    });
    return platformAccountDeleteResponseSchema.parse({ deleted: true });
  }

  async listTenantAuditEvents(session: AdminSession, query: AdminEventQuery): Promise<AdminEventListResponse> {
    requireTenantAdminRole(session, "auditor");
    requireTenantAuditRead(session.role);
    return adminEventListResponseSchema.parse(await this.repository.listTenantEvents(session, query));
  }

  async listPlatformAuditEvents(session: AdminSession, query: AdminEventQuery): Promise<AdminEventListResponse> {
    requirePlatformAdminRole(session, "auditor");
    return adminEventListResponseSchema.parse(await this.repository.listPlatformEvents(query));
  }
}

function platformActorUsername(session: AdminSession): string {
  return session.openUserid.startsWith(PLATFORM_USER_PREFIX)
    ? session.openUserid.slice(PLATFORM_USER_PREFIX.length)
    : session.openUserid;
}

function requireTenantAuditRead(role: AdminRole | PlatformAdminRole): void {
  if (role === "owner" || role === "admin" || role === "auditor") return;
  throw new ForbiddenException("admin role does not have permission");
}
