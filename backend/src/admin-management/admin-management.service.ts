import { Injectable, NotFoundException } from "@nestjs/common";
import { defaultEmployeePublicId } from "../common/default-public-id.js";
import {
  adminMemberCardResponseSchema,
  adminMemberListResponseSchema,
  adminOverviewResponseSchema,
  type AdminMemberCardResponse,
  type AdminMemberListResponse,
  type AdminOverviewResponse,
  type UpdateAdminMemberCardRequest
} from "../contracts/admin-management.js";
import type { EmployeeSession } from "../session/employee-session.js";
import { EmployeeCardService } from "../employee/employee-card.service.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireAdminRole } from "../admin-auth/admin-rbac.js";

@Injectable()
export class AdminManagementService {
  constructor(private readonly employeeCards: EmployeeCardService) {}

  getOverview(session: AdminSession): AdminOverviewResponse {
    const hasMember = Boolean(session.memberIdentityId);
    return adminOverviewResponseSchema.parse({
      tenant_id: session.tenantId,
      tenant_name: session.tenantName,
      member_count: hasMember ? 1 : 0,
      card_count: hasMember ? 1 : 0,
      active_card_count: hasMember ? 1 : 0
    });
  }

  listMembers(session: AdminSession): AdminMemberListResponse {
    if (!session.memberIdentityId) {
      return adminMemberListResponseSchema.parse({ items: [], total: 0 });
    }
    const employeeSession = this.toEmployeeSession(session, session.memberIdentityId);
    const card = this.employeeCards.getCurrentCard(employeeSession);
    return adminMemberListResponseSchema.parse({
      items: [
        {
          member_identity_id: session.memberIdentityId,
          open_userid: session.openUserid,
          display_name: card.display_name,
          status: card.status,
          public_id: card.public_id
        }
      ],
      total: 1
    });
  }

  getMemberCard(session: AdminSession, memberIdentityId: string): AdminMemberCardResponse {
    const employeeSession = this.toEmployeeSession(session, memberIdentityId);
    return adminMemberCardResponseSchema.parse(this.employeeCards.getCurrentCard(employeeSession));
  }

  updateMemberCard(
    session: AdminSession,
    memberIdentityId: string,
    request: UpdateAdminMemberCardRequest
  ): AdminMemberCardResponse {
    requireAdminRole(session.role, "operator");
    const employeeSession = this.toEmployeeSession(session, memberIdentityId);
    return adminMemberCardResponseSchema.parse(this.employeeCards.updateCurrentCard(employeeSession, request));
  }

  private toEmployeeSession(session: AdminSession, memberIdentityId: string): EmployeeSession {
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
