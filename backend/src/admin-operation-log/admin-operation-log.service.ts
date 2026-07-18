import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import type { AdminRole, PlatformAdminRole } from "../contracts/admin-auth.js";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requirePlatformAdminRole, requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminOperationLogListResponseSchema,
  platformOperationLogListResponseSchema,
  type AdminOperationLogListResponse,
  type AdminOperationLogQuery,
  type PlatformOperationLogListResponse,
  type PlatformOperationLogQuery
} from "../contracts/admin-operation-log.js";
import { AdminOperationLogRepository } from "./admin-operation-log.repository.js";

export interface AdminOperationLogEntry {
  session: AdminSession;
  action: string;
  // Defaults to session.tenantId; platform actions pass the affected tenant id
  // so platform-side per-tenant filtering works.
  tenantId?: string | number | undefined;
  targetType?: string | undefined;
  targetId?: string | number | undefined;
  detail?: Record<string, unknown> | undefined;
}

@Injectable()
export class AdminOperationLogService {
  private readonly logger = new Logger(AdminOperationLogService.name);

  constructor(private readonly repository: AdminOperationLogRepository) {}

  // Best-effort audit write: failures never break the business operation, but they are logged
  // (not silently swallowed) so a broken audit trail is observable. See 99_71 (A71-P1-5).
  async record(entry: AdminOperationLogEntry): Promise<void> {
    try {
      const { session } = entry;
      await this.repository.insert({
        tenantId: entry.tenantId === undefined || entry.tenantId === null ? session.tenantId : String(entry.tenantId),
        // The session token carries member_identity_id, not tenant_admins.id; it is the
        // only numeric actor reference available, and non-numeric values become null.
        actorAdminId: session.memberIdentityId && /^\d+$/.test(session.memberIdentityId) ? session.memberIdentityId : null,
        actorOpenUserid: session.openUserid || null,
        // The session token has no display name; the column stays null until one is available.
        actorName: null,
        actorRole: session.role,
        accountType: session.accountType ?? "tenant",
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId === undefined || entry.targetId === null ? null : String(entry.targetId),
        detail: entry.detail ?? null,
        ip: session.requestIp ?? null
      });
    } catch (error) {
      this.logger.warn({ action: entry.action, err: error instanceof Error ? error.message : error }, "admin operation log write failed");
    }
  }

  async listTenantLogs(session: AdminSession, query: AdminOperationLogQuery): Promise<AdminOperationLogListResponse> {
    requireTenantAdminRole(session, "auditor");
    requireTenantOperationLogRead(session.role);
    return adminOperationLogListResponseSchema.parse(await this.repository.listTenantLogs(session.tenantId, query));
  }

  async listPlatformLogs(session: AdminSession, query: PlatformOperationLogQuery): Promise<PlatformOperationLogListResponse> {
    requirePlatformAdminRole(session, "auditor");
    return platformOperationLogListResponseSchema.parse(await this.repository.listPlatformLogs(query));
  }
}

function requireTenantOperationLogRead(role: AdminRole | PlatformAdminRole): void {
  if (role === "owner" || role === "admin" || role === "auditor") return;
  throw new ForbiddenException("admin role does not have permission");
}
