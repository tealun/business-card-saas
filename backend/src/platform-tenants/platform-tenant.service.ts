import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole } from "../admin-auth/admin-rbac.js";
import { WecomContactSyncService } from "../wecom/wecom-contact-sync.service.js";
import { PlatformTenantRepository, type PlatformTenantDetailRecord, type PlatformTenantListRecord } from "./platform-tenant.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";
import { OwnerBootstrapService } from "../admin-bootstrap/owner-bootstrap.service.js";
import { WechatJoinQrService } from "../local-enterprise/wechat-join-qr.service.js";

@Injectable()
export class PlatformTenantService {
  constructor(
    private readonly repository: PlatformTenantRepository,
    private readonly contactSync: WecomContactSyncService,
    private readonly ownerBootstrap: OwnerBootstrapService,
    private readonly claimQr: WechatJoinQrService,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  async list(session: AdminSession, input: { search?: string; status?: string; page?: number; pageSize?: number }) {
    this.requirePlatform(session);
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.trunc(input.pageSize ?? 20)));
    const status = ["unconnected", "active", "changed", "cancelled", "all"].includes(input.status ?? "")
      ? input.status!
      : "all";
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
        local_count: summary.localCount,
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
    if (item.creationSource !== "wecom" || !item.openCorpid || item.authStatus !== "active") {
      throw new BadRequestException("enterprise has no active WeCom connection");
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

  // Create an empty local enterprise plus a one-time claim token. The tenant has
  // no owner until an enterprise contact claims it from the mini program. Only
  // platform_owner may manage local enterprises (requirePlatformAdminRole owner).
  async createLocalEnterprise(session: AdminSession, input: { name: string; memberLimit: number | null }) {
    requirePlatformAdminRole(session, "owner");
    const name = input.name.trim();
    if (name.length < 2 || name.length > 255) {
      throw new BadRequestException("enterprise name must be between 2 and 255 characters");
    }
    const created = await this.repository.createLocalTenant({ name, memberLimit: input.memberLimit });
    const claim = await this.ownerBootstrap.bootstrapOwner({ tenant_id: created.tenantId });
    const claimPath = claim.mode === "claim_token_created"
      ? `pages/enterprise-claim/index?token=${encodeURIComponent(claim.claim_token)}`
      : null;
    const claimQr = claim.mode === "claim_token_created"
      ? await this.generateClaimQr(claim.claim_token)
      : { dataUrl: null, error: "" };
    await this.operationLogs?.record({
      session,
      action: "platform.tenant.create",
      tenantId: created.tenantId,
      targetType: "tenant",
      targetId: created.tenantId,
      detail: { name: created.name, member_limit: input.memberLimit, qr_generated: Boolean(claimQr.dataUrl), qr_error: claimQr.error || undefined }
    });
    return {
      tenant_id: created.tenantId,
      tenant_name: created.name,
      member_limit: input.memberLimit,
      claim_token: claim.mode === "claim_token_created" ? claim.claim_token : null,
      claim_code: claim.mode === "claim_token_created" ? claim.claim_code : null,
      claim_expires_at: claim.mode === "claim_token_created" ? claim.expires_at : null,
      claim_path: claimPath,
      claim_qr_code_data_url: claimQr.dataUrl,
      claim_qr_error: claimQr.error || null
    };
  }

  async createLocalEnterpriseClaimToken(session: AdminSession, tenantId: string) {
    requirePlatformAdminRole(session, "owner");
    const record = await this.getWritableOrThrow(tenantId);
    if (record.activeOwnerCount > 0) {
      throw new BadRequestException("local enterprise already has an active owner");
    }
    const claim = await this.createClaimPayload(record.tenantId, record.name);
    await this.operationLogs?.record({
      session,
      action: "platform.tenant.claim_token.create",
      tenantId: record.tenantId,
      targetType: "tenant",
      targetId: record.tenantId,
      detail: { qr_generated: Boolean(claim.claim_qr_code_data_url) }
    });
    return claim;
  }

  async renameLocalEnterprise(session: AdminSession, tenantId: string, name: string) {
    requirePlatformAdminRole(session, "owner");
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 255) {
      throw new BadRequestException("enterprise name must be between 2 and 255 characters");
    }
    await this.getWritableOrThrow(tenantId);
    const updated = await this.repository.renameLocalTenant(tenantId, trimmed);
    if (!updated) {
      throw new NotFoundException("local enterprise not found");
    }
    await this.operationLogs?.record({
      session,
      action: "platform.tenant.rename",
      tenantId,
      targetType: "tenant",
      targetId: tenantId,
      detail: { name: trimmed }
    });
    return { tenant_id: tenantId, tenant_name: trimmed };
  }

  async setLocalEnterpriseStatus(session: AdminSession, tenantId: string, status: "active" | "disabled") {
    requirePlatformAdminRole(session, "owner");
    await this.getWritableOrThrow(tenantId);
    const updated = await this.repository.setLocalTenantStatus(tenantId, status);
    if (!updated) {
      throw new NotFoundException("local enterprise not found");
    }
    await this.operationLogs?.record({
      session,
      action: status === "disabled" ? "platform.tenant.disable" : "platform.tenant.enable",
      tenantId,
      targetType: "tenant",
      targetId: tenantId,
      detail: { status }
    });
    return { tenant_id: tenantId, status };
  }

  async deleteLocalEnterprise(session: AdminSession, tenantId: string) {
    requirePlatformAdminRole(session, "owner");
    await this.getWritableOrThrow(tenantId);
    const deleted = await this.repository.softDeleteLocalTenant(tenantId);
    if (!deleted) {
      throw new NotFoundException("local enterprise not found");
    }
    await this.operationLogs?.record({
      session,
      action: "platform.tenant.delete",
      tenantId,
      targetType: "tenant",
      targetId: tenantId,
      detail: { soft_delete: true }
    });
    return { tenant_id: tenantId, deleted: true };
  }

  private async getWritableOrThrow(tenantId: string) {
    const record = await this.repository.getLocalWritable(tenantId);
    if (!record) {
      throw new NotFoundException("local enterprise not found");
    }
    return record;
  }

  private async createClaimPayload(tenantId: string, tenantName: string) {
    const claim = await this.ownerBootstrap.bootstrapOwner({ tenant_id: tenantId });
    const claimPath = claim.mode === "claim_token_created"
      ? `pages/enterprise-claim/index?token=${encodeURIComponent(claim.claim_token)}`
      : null;
    const claimQr = claim.mode === "claim_token_created"
      ? await this.generateClaimQr(claim.claim_token)
      : { dataUrl: null, error: "" };
    return {
      tenant_id: tenantId,
      tenant_name: tenantName,
      claim_token: claim.mode === "claim_token_created" ? claim.claim_token : null,
      claim_code: claim.mode === "claim_token_created" ? claim.claim_code : null,
      claim_expires_at: claim.mode === "claim_token_created" ? claim.expires_at : null,
      claim_path: claimPath,
      claim_qr_code_data_url: claimQr.dataUrl,
      claim_qr_error: claimQr.error || null
    };
  }

  private async generateClaimQr(claimToken: string): Promise<{ dataUrl: string | null; error: string }> {
    try {
      const dataUrl = await this.claimQr.generateScene(this.claimScene(claimToken), "pages/enterprise-claim/index");
      return { dataUrl, error: dataUrl ? "" : "wechat_miniprogram_credentials_missing" };
    } catch (error) {
      return { dataUrl: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private claimScene(claimToken: string): string {
    return claimToken.startsWith("admclaim_") ? claimToken.slice("admclaim_".length) : claimToken;
  }

  private formatListItem(item: PlatformTenantListRecord) {
    return {
      tenant_id: item.tenantId,
      tenant_name: item.name,
      creation_source: item.creationSource,
      open_corpid: item.openCorpid,
      auth_status: item.authStatus,
      status: item.status,
      member_limit: item.memberLimit,
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
      admins: item.admins.map((admin) => ({
        admin_id: admin.adminId,
        member_identity_id: admin.memberId,
        name: admin.name,
        open_userid: admin.openUserid,
        role: admin.role,
        status: admin.status,
        auth_source: admin.authSource,
        created_at: admin.createdAt.toISOString(),
        updated_at: admin.updatedAt.toISOString()
      })),
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

