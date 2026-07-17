import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { AdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole, requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminEventListResponseSchema,
  type AdminEventListResponse,
  type AdminEventQuery,
  type AdminListQuery,
  platformAdminListResponseSchema,
  type PlatformAdminListResponse,
  tenantAdminListResponseSchema,
  tenantAdminSummarySchema,
  type TenantAdminListResponse,
  type TenantAdminSummary
} from "../contracts/admin-observability.js";
import { AdminObservabilityRepository } from "./admin-observability.repository.js";

const PLATFORM_USER_PREFIX = "platform:";

@Injectable()
export class AdminObservabilityService {
  constructor(private readonly repository: AdminObservabilityRepository) {}

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
    return tenantAdminSummarySchema.parse(updated);
  }

  async listPlatformAdmins(session: AdminSession, query: AdminListQuery): Promise<PlatformAdminListResponse> {
    requirePlatformAdminRole(session, "owner");
    return platformAdminListResponseSchema.parse(await this.repository.listPlatformAdmins(query));
  }

  async updatePlatformAdminStatus(session: AdminSession, adminId: string, status: "active" | "disabled") {
    requirePlatformAdminRole(session, "owner");
    const currentUsername = session.openUserid.startsWith(PLATFORM_USER_PREFIX)
      ? session.openUserid.slice(PLATFORM_USER_PREFIX.length)
      : session.openUserid;
    const updated = await this.repository.updatePlatformAdminStatus(adminId, status, currentUsername);
    if (!updated) {
      throw new NotFoundException("platform admin not found or cannot change own status");
    }
    return updated;
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

function requireTenantAuditRead(role: AdminRole): void {
  if (role === "owner" || role === "admin" || role === "auditor") return;
  throw new ForbiddenException("admin role does not have permission");
}
