import { Injectable, NotFoundException } from "@nestjs/common";
import { defaultEmployeePublicId } from "../common/default-public-id.js";
import {
  adminMemberCardResponseSchema,
  adminMemberListResponseSchema,
  adminMemberSyncResponseSchema,
  adminOverviewResponseSchema,
  adminSyncEventListResponseSchema,
  type AdminMemberCardResponse,
  type AdminMemberListResponse,
  type AdminMemberSyncResponse,
  type AdminOverviewResponse,
  type AdminSyncEventListResponse,
  type UpdateAdminMemberCardRequest
} from "../contracts/admin-management.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardService } from "../employee/employee-card.service.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireAdminRole } from "../admin-auth/admin-rbac.js";
import { WecomContactSyncService } from "../wecom/wecom-contact-sync.service.js";
import { AdminManagementRepository } from "./admin-management.repository.js";

@Injectable()
export class AdminManagementService {
  constructor(
    private readonly employeeCards: EmployeeCardService,
    private readonly repository: AdminManagementRepository,
    private readonly contactSync: WecomContactSyncService
  ) {}

  async getOverview(session: AdminSession): Promise<AdminOverviewResponse> {
    const persisted = await this.repository.getOverview(session);
    if (persisted) {
      return adminOverviewResponseSchema.parse(persisted);
    }
    const hasMember = Boolean(session.memberIdentityId);
    return adminOverviewResponseSchema.parse({
      tenant_id: session.tenantId,
      tenant_name: session.tenantName,
      member_count: hasMember ? 1 : 0,
      card_count: hasMember ? 1 : 0,
      active_card_count: hasMember ? 1 : 0
    });
  }

  async listMembers(session: AdminSession): Promise<AdminMemberListResponse> {
    const persisted = await this.repository.listMembers(session);
    if (persisted) {
      return adminMemberListResponseSchema.parse(persisted);
    }
    if (!session.memberIdentityId) {
      return adminMemberListResponseSchema.parse({ items: [], total: 0 });
    }
    const employeeSession = await this.toEmployeeSession(session, session.memberIdentityId);
    const card = this.employeeCards.getCurrentCard(employeeSession);
    return adminMemberListResponseSchema.parse({
      items: [
        {
          member_identity_id: session.memberIdentityId,
          userid: null,
          open_userid: session.openUserid,
          display_name: card.display_name,
          status: card.status,
          public_id: card.public_id
        }
      ],
      total: 1
    });
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
      skipped_count: result.skippedCount
    });
  }

  async listSyncEvents(session: AdminSession): Promise<AdminSyncEventListResponse> {
    const persisted = await this.repository.listSyncEvents(session);
    return adminSyncEventListResponseSchema.parse(persisted ?? { items: [], total: 0 });
  }

  async getMemberCard(session: AdminSession, memberIdentityId: string): Promise<AdminMemberCardResponse> {
    const persisted = await this.repository.getMemberCard(session, memberIdentityId);
    if (persisted) {
      return adminMemberCardResponseSchema.parse(persisted);
    }
    if (this.repository.isDatabaseConfigured()) {
      throw new NotFoundException("tenant member not found");
    }
    const employeeSession = await this.toEmployeeSession(session, memberIdentityId);
    return adminMemberCardResponseSchema.parse(this.employeeCards.getCurrentCard(employeeSession));
  }

  async updateMemberCard(
    session: AdminSession,
    memberIdentityId: string,
    request: UpdateAdminMemberCardRequest
  ): Promise<AdminMemberCardResponse> {
    requireAdminRole(session.role, "operator");
    const persisted = await this.repository.updateMemberCard(session, memberIdentityId, request);
    if (persisted) {
      return adminMemberCardResponseSchema.parse(persisted);
    }
    if (this.repository.isDatabaseConfigured()) {
      throw new NotFoundException("tenant member not found");
    }
    const employeeSession = await this.toEmployeeSession(session, memberIdentityId);
    let card = this.employeeCards.updateCurrentCard(employeeSession, request);
    if (request.status !== undefined) {
      const persisted = await this.repository.updateMemberStatus(session, memberIdentityId, request.status);
      if (persisted === false) {
        throw new NotFoundException("tenant member not found");
      }
      card = this.employeeCards.updateCurrentCardStatus(employeeSession, request.status);
    }
    return adminMemberCardResponseSchema.parse(card);
  }

  private async toEmployeeSession(session: AdminSession, memberIdentityId: string): Promise<EmployeeSession> {
    const persisted = await this.repository.getMemberSession(session, memberIdentityId);
    if (persisted) {
      return persisted;
    }
    if (!session.memberIdentityId || session.memberIdentityId !== memberIdentityId) {
      throw new NotFoundException("tenant member not found");
    }
    return {
      accountId: `admin:${session.openUserid}`,
      tenantId: session.tenantId,
      tenantName: session.tenantName,
      memberIdentityId: session.memberIdentityId,
      displayName: session.openUserid,
      openUserid: session.openUserid,
      publicId: defaultEmployeePublicId({
        tenantId: session.tenantId,
        memberIdentityId: session.memberIdentityId
      })
    };
  }
}
