import { ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole } from "../admin-auth/admin-rbac.js";
import { WecomContactSyncService } from "../wecom/wecom-contact-sync.service.js";
import { PlatformTenantRepository, type PlatformTenantDetailRecord, type PlatformTenantListRecord } from "./platform-tenant.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";

@Injectable()
export class PlatformTenantService {
  constructor(
    private readonly repository: PlatformTenantRepository,
    private readonly contactSync: WecomContactSyncService,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  async list(session: AdminSession, input: { search?: string; status?: string; page?: number; pageSize?: number }) {
    this.requirePlatform(session);
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    const status = ["active", "cancelled", "all"].includes(input.status ?? "") ? input.status! : "all";
    const [result, summary] = await Promise.all([
      this.repository.list({
        search: input.search?.trim() ?? "",
        status,
        limit: pageSize,
        offset: (page - 1) * pageSize
      }),
      this.repository.summary()
    ]);
    return {
      page,
      page_size: pageSize,
      total: result.total,
      summary: {
        active_count: summary.activeCount,
        cancelled_count: summary.cancelledCount,
        unhealthy_count: summary.unhealthyCount
      },
      items: result.items.map((item) => this.formatListItem(item))
    };
  }

  async get(session: AdminSession, tenantId: string) {
    this.requirePlatform(session);
    if (!/^\d+$/.test(tenantId)) {
      throw new NotFoundException("enterprise authorization not found");
    }
    const item = await this.repository.getById(tenantId);
    if (!item) {
      throw new NotFoundException("enterprise authorization not found");
    }
    return this.formatDetail(item);
  }

  async syncTenantMembers(session: AdminSession, tenantId: string) {
    requirePlatformAdminRole(session, "operator");
    if (!/^\d+$/.test(tenantId)) {
      throw new NotFoundException("enterprise authorization not found");
    }
    const item = await this.repository.getById(tenantId);
    if (!item) {
      throw new NotFoundException("enterprise authorization not found");
    }
    const result = await this.contactSync.syncTenantMembers({
      tenantId: item.tenantId,
      tenantName: item.name
    });
    await this.operationLogs?.record({
      session,
      action: "platform.tenant.sync",
      tenantId: item.tenantId,
      targetType: "tenant",
      targetId: item.tenantId,
      detail: {
        synced_count: result.syncedCount,
        skipped_count: result.skippedCount,
        disabled_count: result.disabledCount,
        detail_synced_count: result.detailSyncedCount,
        detail_missing_count: result.detailMissingCount
      }
    });
    return {
      tenant_id: result.tenantId,
      synced_count: result.syncedCount,
      skipped_count: result.skippedCount,
      disabled_count: result.disabledCount,
      detail_synced_count: result.detailSyncedCount,
      detail_missing_count: result.detailMissingCount
    };
  }

  private requirePlatform(session: AdminSession): void {
    if (session.accountType !== "platform") {
      throw new ForbiddenException("platform administrator required");
    }
  }

  private formatListItem(item: PlatformTenantListRecord) {
    return {
      tenant_id: item.tenantId,
      tenant_name: item.name,
      open_corpid: item.openCorpid,
      auth_status: item.authStatus,
      agent_id: item.agentId,
      authorized_at: item.authorizedAt?.toISOString() ?? null,
      updated_at: item.updatedAt.toISOString(),
      member_count: item.memberCount,
      active_member_count: item.activeMemberCount,
      card_count: item.cardCount,
      active_card_count: item.activeCardCount,
      authorization_healthy: item.authStatus === "active" && item.permanentCodeConfigured
    };
  }

  private formatDetail(item: PlatformTenantDetailRecord) {
    return {
      ...this.formatListItem(item),
      auth_scope: item.authScope,
      permanent_code_configured: item.permanentCodeConfigured,
      corp_token_cached: item.corpTokenCached,
      corp_token_expires_at: item.corpTokenExpiresAt?.toISOString() ?? null,
      cancel_auth_time: item.cancelAuthTime?.toISOString() ?? null,
      admin_count: item.adminCount,
      active_admin_count: item.activeAdminCount,
      authorization_healthy: item.authStatus === "active" && item.permanentCodeConfigured,
      last_callback: item.lastCallback
        ? {
            event_type: item.lastCallback.eventType,
            change_type: item.lastCallback.changeType,
            status: item.lastCallback.status,
            received_at: item.lastCallback.receivedAt.toISOString(),
            processed_at: item.lastCallback.processedAt?.toISOString() ?? null,
            retry_count: item.lastCallback.retryCount,
            last_error: item.lastCallback.lastError
          }
        : null
    };
  }
}

