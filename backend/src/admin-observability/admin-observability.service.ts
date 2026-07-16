import { Injectable } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireAdminRole, requirePlatformAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminEventListResponseSchema,
  type AdminEventListResponse,
  type AdminEventQuery,
  type AdminListQuery,
  platformAdminListResponseSchema,
  type PlatformAdminListResponse,
  tenantAdminListResponseSchema,
  type TenantAdminListResponse
} from "../contracts/admin-observability.js";
import { AdminObservabilityRepository } from "./admin-observability.repository.js";

@Injectable()
export class AdminObservabilityService {
  constructor(private readonly repository: AdminObservabilityRepository) {}

  async listTenantAdmins(session: AdminSession, query: AdminListQuery): Promise<TenantAdminListResponse> {
    requireAdminRole(session.role, "owner");
    return tenantAdminListResponseSchema.parse(await this.repository.listTenantAdmins(session, query));
  }

  async listPlatformAdmins(session: AdminSession, query: AdminListQuery): Promise<PlatformAdminListResponse> {
    requirePlatformAdminRole(session, "owner");
    return platformAdminListResponseSchema.parse(await this.repository.listPlatformAdmins(query));
  }

  async listTenantAuditEvents(session: AdminSession, query: AdminEventQuery): Promise<AdminEventListResponse> {
    return adminEventListResponseSchema.parse(await this.repository.listTenantEvents(session, query));
  }

  async listPlatformAuditEvents(session: AdminSession, query: AdminEventQuery): Promise<AdminEventListResponse> {
    requirePlatformAdminRole(session, "auditor");
    return adminEventListResponseSchema.parse(await this.repository.listPlatformEvents(query));
  }
}
