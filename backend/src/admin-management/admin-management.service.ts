import { Injectable, NotFoundException } from "@nestjs/common";
import {
  adminMemberCardResponseSchema,
  adminMemberListResponseSchema,
  adminMemberSyncResponseSchema,
  adminOverviewResponseSchema,
  adminSyncEventRetryResponseSchema,
  adminSyncEventListResponseSchema,
  adminWecomSettingsResponseSchema,
  type AdminMemberCardResponse,
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
import { requireAdminRole } from "../admin-auth/admin-rbac.js";
import { WecomContactSyncService } from "../wecom/wecom-contact-sync.service.js";
import { WecomDataCallbackService } from "../wecom/wecom-data-callback.service.js";
import { WecomAuthorizationService } from "../wecom/wecom-authorization.service.js";
import { WecomTenantSettingsRepository } from "../wecom/wecom-tenant-settings.repository.js";
import { AdminManagementRepository } from "./admin-management.repository.js";

@Injectable()
export class AdminManagementService {
  constructor(
    private readonly repository: AdminManagementRepository,
    private readonly contactSync: WecomContactSyncService,
    private readonly dataCallbacks: WecomDataCallbackService,
    private readonly authorization: WecomAuthorizationService,
    private readonly wecomSettings: WecomTenantSettingsRepository
  ) {}

  async getOverview(session: AdminSession): Promise<AdminOverviewResponse> {
    const persisted = await this.repository.getOverview(session);
    return adminOverviewResponseSchema.parse(persisted);
  }

  async listMembers(session: AdminSession, input: AdminMemberListQuery): Promise<AdminMemberListResponse> {
    const persisted = await this.repository.listMembers(session, input);
    return adminMemberListResponseSchema.parse(persisted);
  }

  async syncMembers(session: AdminSession): Promise<AdminMemberSyncResponse> {
    requireAdminRole(session.role, "admin");
    const result = await this.contactSync.syncTenantMembers({
      tenantId: session.tenantId,
      tenantName: session.tenantName
    });
    return adminMemberSyncResponseSchema.parse({
      tenant_id: result.tenantId,
      synced_count: result.syncedCount,
      skipped_count: result.skippedCount,
      disabled_count: result.disabledCount
    });
  }

  async listSyncEvents(session: AdminSession): Promise<AdminSyncEventListResponse> {
    const persisted = await this.repository.listSyncEvents(session);
    return adminSyncEventListResponseSchema.parse(persisted ?? { items: [], total: 0 });
  }

  async retryFailedSyncEvents(session: AdminSession): Promise<AdminSyncEventRetryResponse> {
    requireAdminRole(session.role, "admin");
    const dataResult = await this.dataCallbacks.retryFailedEvents({ tenantId: session.tenantId });
    const syncResult = await this.authorization.retryFailedContactSyncs({ tenantId: session.tenantId });
    return adminSyncEventRetryResponseSchema.parse({
      retried_count: dataResult.retriedCount + syncResult.retriedCount,
      succeeded_count: dataResult.succeededCount + syncResult.succeededCount,
      failed_count: dataResult.failedCount + syncResult.failedCount,
      dead_count: dataResult.deadCount + syncResult.deadCount
    });
  }

  async getWecomSettings(session: AdminSession): Promise<AdminWecomSettingsResponse> {
    return adminWecomSettingsResponseSchema.parse(await this.wecomSettings.get(session.tenantId));
  }

  async updateWecomSettings(
    session: AdminSession,
    request: UpdateAdminWecomSettingsRequest
  ): Promise<AdminWecomSettingsResponse> {
    requireAdminRole(session.role, "admin");
    return adminWecomSettingsResponseSchema.parse(await this.wecomSettings.update(session.tenantId, request));
  }

  async getMemberCard(session: AdminSession, memberIdentityId: string): Promise<AdminMemberCardResponse> {
    const persisted = await this.repository.getMemberCard(session, memberIdentityId);
    if (!persisted) {
      throw new NotFoundException("tenant member not found");
    }
    return adminMemberCardResponseSchema.parse(persisted);
  }

  async updateMemberCard(
    session: AdminSession,
    memberIdentityId: string,
    request: UpdateAdminMemberCardRequest
  ): Promise<AdminMemberCardResponse> {
    requireAdminRole(session.role, "operator");
    const persisted = await this.repository.updateMemberCard(session, memberIdentityId, request);
    if (!persisted) {
      throw new NotFoundException("tenant member not found");
    }
    // The repository applies member, card, directory, fields and status updates
    // inside one TenantTx and returns the reloaded card. Do not repeat the
    // status mutation in a second transaction here.
    return adminMemberCardResponseSchema.parse(persisted);
  }
}
