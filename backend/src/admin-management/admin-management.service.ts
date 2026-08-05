import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  adminMemberCardResponseSchema,
  adminMemberDeleteResponseSchema,
  adminMemberListResponseSchema,
  adminMemberSyncResponseSchema,
  adminOverviewResponseSchema,
  adminSyncEventRetryResponseSchema,
  adminSyncEventListResponseSchema,
  adminWecomSettingsResponseSchema,
  type AdminMemberCardResponse,
  type AdminMemberDeleteResponse,
  type AdminMemberListQuery,
  type AdminMemberListResponse,
  type AdminMemberSyncResponse,
  type AdminOverviewResponse,
  type AdminSyncEventRetryResponse,
  type AdminSyncEventListResponse,
  type AdminWecomSettingsResponse,
  type UpdateAdminWecomSettingsRequest,
  type UpdateAdminMemberCardRequest
} from "../contracts/admin-management.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole, requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import { WecomContactSyncService } from "../wecom/wecom-contact-sync.service.js";
import { WecomDataCallbackService } from "../wecom/wecom-data-callback.service.js";
import { WecomAuthorizationService } from "../wecom/wecom-authorization.service.js";
import { WecomTenantSettingsRepository } from "../wecom/wecom-tenant-settings.repository.js";
import { AdminManagementRepository } from "./admin-management.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";

@Injectable()
export class AdminManagementService {
  constructor(
    private readonly repository: AdminManagementRepository,
    private readonly contactSync: WecomContactSyncService,
    private readonly dataCallbacks: WecomDataCallbackService,
    private readonly authorization: WecomAuthorizationService,
    private readonly wecomSettings: WecomTenantSettingsRepository,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  /**
   * 获取当前租户后台概览。
   *
   * auditor 及以上可读；返回前按后台契约 schema 规范化，避免 repository 的空值或扩展字段泄漏。
   */
  async getOverview(session: AdminSession): Promise<AdminOverviewResponse> {
    requireTenantAdminRole(session, "auditor");
    const persisted = await this.repository.getOverview(session);
    return adminOverviewResponseSchema.parse(persisted);
  }

  /**
   * 查询当前租户成员列表。
   *
   * 仅允许租户内 auditor 及以上访问，筛选和分页参数交给 repository 转成安全查询。
   */
  async listMembers(session: AdminSession, input: AdminMemberListQuery): Promise<AdminMemberListResponse> {
    requireTenantAdminRole(session, "auditor");
    const persisted = await this.repository.listMembers(session, input);
    return adminMemberListResponseSchema.parse(persisted);
  }

  /**
   * 手动同步当前租户的企业微信成员。
   *
   * 只有绑定了有效企业微信授权的租户才能执行；同步结果会写入操作日志，便于后台审计。
   */
  async syncMembers(session: AdminSession): Promise<AdminMemberSyncResponse> {
    requireTenantAdminRole(session, "admin");
    const overview = adminOverviewResponseSchema.parse(await this.repository.getOverview(session));
    if (!overview.wecom_bound) {
      throw new BadRequestException("企业未绑定企业微信，无法同步成员");
    }
    const result = await this.contactSync.syncTenantMembers({
      tenantId: session.tenantId,
      tenantName: session.tenantName
    });
    const response = adminMemberSyncResponseSchema.parse({
      tenant_id: result.tenantId,
      synced_count: result.syncedCount,
      skipped_count: result.skippedCount,
      disabled_count: result.disabledCount,
      detail_synced_count: result.detailSyncedCount,
      detail_missing_count: result.detailMissingCount
    });
    await this.operationLogs?.record({
      session,
      action: "member.sync",
      detail: {
        synced_count: response.synced_count,
        skipped_count: response.skipped_count,
        disabled_count: response.disabled_count,
        detail_synced_count: response.detail_synced_count,
        detail_missing_count: response.detail_missing_count
      }
    });
    return response;
  }

  /**
   * 删除当前租户成员。
   *
   * 管理员身份绑定的成员不能直接删除，必须先解除管理员身份，避免删掉后台访问入口。
   */
  async deleteMember(session: AdminSession, memberIdentityId: string): Promise<AdminMemberDeleteResponse> {
    requireTenantAdminRole(session, "admin");
    const outcome = await this.repository.deleteMember(session, memberIdentityId);
    if (outcome === null || outcome === "not_found") {
      throw new NotFoundException("tenant member not found");
    }
    if (outcome === "admin_bound") {
      throw new ConflictException("该成员绑定了企业管理员账号，请先移除管理员身份后再删除");
    }
    const response = adminMemberDeleteResponseSchema.parse({
      member_identity_id: memberIdentityId,
      deleted: true
    });
    await this.operationLogs?.record({
      session,
      action: "member.delete",
      targetType: "member_identity",
      targetId: memberIdentityId
    });
    return response;
  }

  /**
   * 查询当前租户同步事件。
   *
   * 用于后台观察企业微信回调、通讯录同步等异步事件的处理状态。
   */
  async listSyncEvents(session: AdminSession): Promise<AdminSyncEventListResponse> {
    requireTenantAdminRole(session, "auditor");
    const persisted = await this.repository.listSyncEvents(session);
    return adminSyncEventListResponseSchema.parse(persisted ?? { items: [], total: 0 });
  }

  /**
   * 重试当前租户失败的同步事件。
   *
   * 同时覆盖数据回调和通讯录同步失败队列，返回合并后的重试统计并记录操作日志。
   */
  async retryFailedSyncEvents(session: AdminSession): Promise<AdminSyncEventRetryResponse> {
    requireTenantAdminRole(session, "admin");
    const dataResult = await this.dataCallbacks.retryFailedEvents({ tenantId: session.tenantId });
    const syncResult = await this.authorization.retryFailedContactSyncs({ tenantId: session.tenantId });
    const response = adminSyncEventRetryResponseSchema.parse({
      retried_count: dataResult.retriedCount + syncResult.retriedCount,
      succeeded_count: dataResult.succeededCount + syncResult.succeededCount,
      failed_count: dataResult.failedCount + syncResult.failedCount,
      dead_count: dataResult.deadCount + syncResult.deadCount
    });
    await this.operationLogs?.record({
      session,
      action: "sync.retry",
      detail: {
        retried_count: response.retried_count,
        succeeded_count: response.succeeded_count,
        failed_count: response.failed_count,
        dead_count: response.dead_count
      }
    });
    return response;
  }

  /**
   * 平台侧重试同步事件。
   *
   * 可指定租户，也可全局重试；只允许平台 operator 及以上角色执行。
   */
  async retryPlatformSyncEvents(session: AdminSession, tenantId?: string): Promise<AdminSyncEventRetryResponse> {
    requirePlatformAdminRole(session, "operator");
    const scoped = tenantId?.trim();
    const dataResult = await this.dataCallbacks.retryFailedEvents(scoped ? { tenantId: scoped } : {});
    const syncResult = await this.authorization.retryFailedContactSyncs(scoped ? { tenantId: scoped } : {});
    const response = adminSyncEventRetryResponseSchema.parse({
      retried_count: dataResult.retriedCount + syncResult.retriedCount,
      succeeded_count: dataResult.succeededCount + syncResult.succeededCount,
      failed_count: dataResult.failedCount + syncResult.failedCount,
      dead_count: dataResult.deadCount + syncResult.deadCount
    });
    await this.operationLogs?.record({
      session,
      action: "platform.audit.retry",
      tenantId: scoped,
      targetType: scoped ? "tenant" : undefined,
      targetId: scoped,
      detail: {
        retried_count: response.retried_count,
        succeeded_count: response.succeeded_count,
        failed_count: response.failed_count,
        dead_count: response.dead_count
      }
    });
    return response;
  }

  /**
   * 读取当前租户企业微信同步配置。
   */
  async getWecomSettings(session: AdminSession): Promise<AdminWecomSettingsResponse> {
    requireTenantAdminRole(session, "auditor");
    return adminWecomSettingsResponseSchema.parse(await this.wecomSettings.get(session.tenantId));
  }

  /**
   * 更新当前租户企业微信同步配置。
   *
   * 仅 admin 及以上可写，变更字段会进入操作日志，便于追踪同步策略调整。
   */
  async updateWecomSettings(
    session: AdminSession,
    request: UpdateAdminWecomSettingsRequest
  ): Promise<AdminWecomSettingsResponse> {
    requireTenantAdminRole(session, "admin");
    const response = adminWecomSettingsResponseSchema.parse(await this.wecomSettings.update(session.tenantId, request));
    await this.operationLogs?.record({
      session,
      action: "wecom.settings.update",
      detail: { updated_fields: Object.keys(request) }
    });
    return response;
  }

  /**
   * 读取租户成员名片。
   *
   * 只在当前租户范围内查询，找不到时统一返回 404。
   */
  async getMemberCard(session: AdminSession, memberIdentityId: string): Promise<AdminMemberCardResponse> {
    requireTenantAdminRole(session, "auditor");
    const persisted = await this.repository.getMemberCard(session, memberIdentityId);
    if (!persisted) {
      throw new NotFoundException("tenant member not found");
    }
    return adminMemberCardResponseSchema.parse(persisted);
  }

  /**
   * 后台更新租户成员名片。
   *
   * repository 会在一个 TenantTx 中完成成员、名片、目录、字段和状态更新；
   * 服务层只负责权限、契约解析和审计记录。
   */
  async updateMemberCard(
    session: AdminSession,
    memberIdentityId: string,
    request: UpdateAdminMemberCardRequest
  ): Promise<AdminMemberCardResponse> {
    requireTenantAdminRole(session, "operator");
    const persisted = await this.repository.updateMemberCard(session, memberIdentityId, request);
    if (!persisted) {
      throw new NotFoundException("tenant member not found");
    }
    // repository 已在一个 TenantTx 内完成所有相关写入并重新加载结果，这里不能再开第二个事务重复改状态。
    const response = adminMemberCardResponseSchema.parse(persisted);
    await this.operationLogs?.record({
      session,
      action: "member.card.update",
      targetType: "member_identity",
      targetId: memberIdentityId,
      detail: request.status ? { status: request.status } : undefined
    });
    return response;
  }
}
