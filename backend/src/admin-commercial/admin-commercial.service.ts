import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import type { AdminRole, PlatformAdminRole } from "../contracts/admin-auth.js";
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
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";

@Injectable()
export class AdminCommercialService {
  constructor(
    private readonly repository: AdminCommercialRepository,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

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
    const ledger = quotaLedgerSchema.parse(await this.repository.createQuotaAdjustment(session, request));
    await this.operationLogs?.record({
      session,
      action: "platform.quota.adjust",
      tenantId: request.tenant_id,
      targetType: "tenant",
      targetId: request.tenant_id,
      detail: { quota_type: request.quota_type, delta: request.delta }
    });
    return ledger;
  }
}

function requireTenantCommercialRead(role: AdminRole | PlatformAdminRole): void {
  if (role === "owner" || role === "admin" || role === "auditor") return;
  throw new ForbiddenException("admin role does not have permission");
}
