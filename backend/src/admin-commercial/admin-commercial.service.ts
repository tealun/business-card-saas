import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole, requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import {
  platformCommercialResponseSchema,
  quotaLedgerSchema,
  type PlatformCommercialResponse,
  type QuotaAdjustmentRequest,
  tenantCommercialResponseSchema,
  type TenantCommercialResponse
} from "../contracts/admin-commercial.js";
import { AdminCommercialRepository } from "./admin-commercial.repository.js";

@Injectable()
export class AdminCommercialService {
  constructor(private readonly repository: AdminCommercialRepository) {}

  async tenantCommercial(session: AdminSession): Promise<TenantCommercialResponse> {
    requireTenantAdminRole(session, "auditor");
    requireTenantCommercialRead(session.role);
    return tenantCommercialResponseSchema.parse(await this.repository.tenantCommercial(session));
  }

  async platformCommercial(session: AdminSession): Promise<PlatformCommercialResponse> {
    requirePlatformAdminRole(session, "owner");
    return platformCommercialResponseSchema.parse(await this.repository.platformCommercial());
  }

  async createQuotaAdjustment(session: AdminSession, request: QuotaAdjustmentRequest) {
    requirePlatformAdminRole(session, "owner");
    return quotaLedgerSchema.parse(await this.repository.createQuotaAdjustment(session, request));
  }
}

function requireTenantCommercialRead(role: AdminRole): void {
  if (role === "owner" || role === "admin" || role === "auditor") return;
  throw new ForbiddenException("admin role does not have permission");
}
