import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireAdminRole } from "../admin-auth/admin-rbac.js";
import {
  platformVideoFeatureSchema,
  tenantVideoFeatureSchema,
  videoCapabilitySchema,
  type PlatformVideoFeatureRequest,
  type TenantVideoFeatureRequest,
  type VideoCapability
} from "../contracts/company-video-feature.js";
import { CompanyVideoFeatureRepository, type TenantFeatureRecord } from "./company-video-feature.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";

@Injectable()
export class CompanyVideoFeatureService {
  constructor(
    private readonly repository: CompanyVideoFeatureRepository,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  async capability(tenantId: string): Promise<VideoCapability> {
    const platform = await this.repository.getPlatform();
    const tenant = await this.repository.getTenant(tenantId);
    const limit = tenant?.limitBytes ?? platform.defaultLimitBytes;
    return videoCapabilitySchema.parse({
      enabled: platform.enabled && Boolean(tenant?.enabled),
      effective_limit_bytes: limit,
      effective_limit_mb: limit / 1048576,
      source: tenant?.hasOverride ? "tenant_override" : "platform_default"
    });
  }

  async getPlatform(session: AdminSession) {
    this.requirePlatform(session);
    return this.formatPlatform(await this.repository.getPlatform());
  }

  async updatePlatform(session: AdminSession, input: PlatformVideoFeatureRequest) {
    this.requirePlatform(session);
    requireAdminRole(session.role, "admin");
    const updated = this.formatPlatform(await this.repository.updatePlatform(input));
    await this.operationLogs?.record({
      session,
      action: "platform.video_feature.update",
      detail: { enabled: input.enabled, default_limit_bytes: input.default_limit_bytes }
    });
    return updated;
  }

  async listTenants(
    session: AdminSession,
    search: string,
    page: number,
    pageSize: number,
    options: { onlyOverrides?: boolean } = {}
  ) {
    this.requirePlatform(session);
    const platform = await this.repository.getPlatform();
    const result = await this.repository.listTenants(search, pageSize, (page - 1) * pageSize, options);
    return {
      page,
      page_size: pageSize,
      total: result.total,
      items: result.items.map((item) => this.formatTenant(item, platform.enabled, platform.defaultLimitBytes))
    };
  }

  async updateTenant(session: AdminSession, tenantId: string, input: TenantVideoFeatureRequest) {
    this.requirePlatform(session);
    requireAdminRole(session.role, "admin");
    const platform = await this.repository.getPlatform();
    if (input.limit_bytes !== null && input.limit_bytes > platform.defaultLimitBytes) {
      throw new BadRequestException("tenant video limit cannot exceed platform default");
    }
    const current = await this.repository.getTenant(tenantId);
    if (!current) {
      throw new NotFoundException("tenant not found");
    }
    const updated = this.formatTenant(
      await this.repository.updateTenant(tenantId, current.tenantName, input),
      platform.enabled,
      platform.defaultLimitBytes
    );
    await this.operationLogs?.record({
      session,
      action: "platform.video_feature.update",
      tenantId,
      targetType: "tenant",
      targetId: tenantId,
      detail: { enabled: input.enabled, limit_bytes: input.limit_bytes }
    });
    return updated;
  }

  requirePlatform(session: AdminSession) {
    if (session.accountType !== "platform") {
      throw new ForbiddenException("platform administrator required");
    }
  }

  private formatPlatform(item: { enabled: boolean; defaultLimitBytes: number; updatedAt: Date }) {
    return platformVideoFeatureSchema.parse({
      enabled: item.enabled,
      default_limit_bytes: item.defaultLimitBytes,
      default_limit_mb: item.defaultLimitBytes / 1048576,
      updated_at: item.updatedAt.toISOString()
    });
  }

  private formatTenant(item: TenantFeatureRecord, platformEnabled: boolean, platformLimit: number) {
    const limit = item.limitBytes ?? platformLimit;
    return tenantVideoFeatureSchema.parse({
      tenant_id: item.tenantId,
      tenant_name: item.tenantName,
      enabled: item.enabled,
      effective_enabled: platformEnabled && item.enabled,
      limit_bytes: item.limitBytes,
      effective_limit_bytes: limit,
      source: item.hasOverride ? "tenant_override" : "platform_default",
      updated_at: item.updatedAt?.toISOString() ?? null
    });
  }
}
