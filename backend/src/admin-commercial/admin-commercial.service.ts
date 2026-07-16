import { Injectable } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole } from "../admin-auth/admin-rbac.js";
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
