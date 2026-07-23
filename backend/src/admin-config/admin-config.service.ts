import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminCompanyProfileSchema,
  adminCompanyHonorListResponseSchema,
  adminCompanyHonorSchema,
  adminCompanyVideoListResponseSchema,
  adminCompanyVideoSchema,
  adminFieldSettingsResponseSchema,
  adminTemplateListResponseSchema,
  adminTemplateSchema,
  type AdminCompanyHonor,
  type AdminCompanyHonorListResponse,
  type AdminCompanyProfile,
  type AdminCompanyVideo,
  type AdminCompanyVideoListResponse,
  type AdminFieldSettingsResponse,
  type AdminTemplate,
  type AdminTemplateListResponse,
  type CreateAdminCompanyHonorRequest,
  type CreateAdminCompanyVideoRequest,
  type CreateAdminTemplateRequest,
  type UpdateAdminCompanyProfileRequest,
  type UpdateAdminCompanyHonorRequest,
  type UpdateAdminCompanyVideoRequest,
  type UpdateAdminFieldSettingsRequest,
  type UpdateAdminTemplateRequest
} from "../contracts/admin-config.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { CompanyVideoFeatureService } from "../company-video-feature/company-video-feature.service.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";

@Injectable()
export class AdminConfigService {
  constructor(
    private readonly repository: AdminConfigRepository,
    private readonly videoFeatures?: CompanyVideoFeatureService,
    @Optional() private readonly operationLogs?: AdminOperationLogService
  ) {}

  async getFieldSettings(session: AdminSession): Promise<AdminFieldSettingsResponse> {
    requireTenantAdminRole(session, "auditor");
    return adminFieldSettingsResponseSchema.parse({
      tenant_id: session.tenantId,
      fields: await this.repository.getFieldSettings(session.tenantId)
    });
  }

  async updateFieldSettings(
    session: AdminSession,
    request: UpdateAdminFieldSettingsRequest
  ): Promise<AdminFieldSettingsResponse> {
    requireTenantAdminRole(session, "admin");
    const response = adminFieldSettingsResponseSchema.parse({
      tenant_id: session.tenantId,
      fields: await this.repository.updateFieldSettings(session.tenantId, request)
    });
    await this.operationLogs?.record({
      session,
      action: "config.fields.update",
      detail: { field_count: request.fields.length }
    });
    return response;
  }

  async getCompanyProfile(session: AdminSession): Promise<AdminCompanyProfile> {
    requireTenantAdminRole(session, "auditor");
    return adminCompanyProfileSchema.parse(
      await this.repository.getCompanyProfile({ tenantId: session.tenantId, tenantName: session.tenantName })
    );
  }

  async updateCompanyProfile(
    session: AdminSession,
    request: UpdateAdminCompanyProfileRequest
  ): Promise<AdminCompanyProfile> {
    requireTenantAdminRole(session, "admin");
    if (request.intro_blocks?.some((block) => block.type === "video")) {
      const capability = await this.videoFeatures?.capability(session.tenantId);
      if (!capability?.enabled) throw new ForbiddenException("company video feature is not enabled");
      for (const block of request.intro_blocks) {
        if (block.type === "video" && !(await this.repository.publishedVideoExists(session.tenantId, block.video_id))) {
          throw new ForbiddenException("video block must reference a published company video");
        }
      }
    }
    const profile = adminCompanyProfileSchema.parse(
      await this.repository.updateCompanyProfile(
        { tenantId: session.tenantId, tenantName: session.tenantName },
        request
      )
    );
    await this.operationLogs?.record({
      session,
      action: request.status === "published" ? "company.profile.publish" : "company.profile.update",
      detail: request.status ? { status: request.status } : undefined
    });
    return profile;
  }

  async listCompanyHonors(session: AdminSession): Promise<AdminCompanyHonorListResponse> {
    requireTenantAdminRole(session, "auditor");
    return adminCompanyHonorListResponseSchema.parse({
      tenant_id: session.tenantId,
      items: await this.repository.listCompanyHonors(session.tenantId)
    });
  }

  async createCompanyHonor(
    session: AdminSession,
    request: CreateAdminCompanyHonorRequest
  ): Promise<AdminCompanyHonor> {
    requireTenantAdminRole(session, "admin");
    const honor = adminCompanyHonorSchema.parse(await this.repository.createCompanyHonor(session.tenantId, request));
    await this.operationLogs?.record({
      session,
      action: "company.honor.create",
      targetType: "company_honor",
      targetId: honor.honor_id
    });
    return honor;
  }

  async updateCompanyHonor(
    session: AdminSession,
    honorId: string,
    request: UpdateAdminCompanyHonorRequest
  ): Promise<AdminCompanyHonor> {
    requireTenantAdminRole(session, "admin");
    const honor = adminCompanyHonorSchema.parse(await this.repository.updateCompanyHonor(session.tenantId, honorId, request));
    await this.operationLogs?.record({
      session,
      action: "company.honor.update",
      targetType: "company_honor",
      targetId: honorId
    });
    return honor;
  }

  async deleteCompanyHonor(session: AdminSession, honorId: string): Promise<void> {
    requireTenantAdminRole(session, "admin");
    await this.repository.deleteCompanyHonor(session.tenantId, honorId);
    await this.operationLogs?.record({
      session,
      action: "company.honor.delete",
      targetType: "company_honor",
      targetId: honorId
    });
  }

  async listCompanyVideos(session: AdminSession): Promise<AdminCompanyVideoListResponse> {
    requireTenantAdminRole(session, "auditor");
    return adminCompanyVideoListResponseSchema.parse({
      tenant_id: session.tenantId,
      items: await this.repository.listCompanyVideos(session.tenantId)
    });
  }

  async createCompanyVideo(
    session: AdminSession,
    request: CreateAdminCompanyVideoRequest
  ): Promise<AdminCompanyVideo> {
    requireTenantAdminRole(session, "admin");
    await this.requireVideoCapability(session.tenantId);
    const video = adminCompanyVideoSchema.parse(await this.repository.createCompanyVideo(session.tenantId, request));
    await this.operationLogs?.record({
      session,
      action: "company.video.create",
      targetType: "company_video",
      targetId: video.video_id
    });
    return video;
  }

  async updateCompanyVideo(
    session: AdminSession,
    videoId: string,
    request: UpdateAdminCompanyVideoRequest
  ): Promise<AdminCompanyVideo> {
    requireTenantAdminRole(session, "admin");
    await this.requireVideoCapability(session.tenantId);
    const video = adminCompanyVideoSchema.parse(await this.repository.updateCompanyVideo(session.tenantId, videoId, request));
    await this.operationLogs?.record({
      session,
      action: "company.video.update",
      targetType: "company_video",
      targetId: videoId
    });
    return video;
  }

  async deleteCompanyVideo(session: AdminSession, videoId: string): Promise<void> {
    requireTenantAdminRole(session, "admin");
    await this.repository.deleteCompanyVideo(session.tenantId, videoId);
    await this.operationLogs?.record({
      session,
      action: "company.video.delete",
      targetType: "company_video",
      targetId: videoId
    });
  }

  async listTemplates(session: AdminSession): Promise<AdminTemplateListResponse> {
    requireTenantAdminRole(session, "auditor");
    return adminTemplateListResponseSchema.parse({
      tenant_id: session.tenantId,
      items: await this.repository.listTemplates(session.tenantId)
    });
  }

  async createTemplate(session: AdminSession, request: CreateAdminTemplateRequest): Promise<AdminTemplate> {
    requireTenantAdminRole(session, "admin");
    const template = adminTemplateSchema.parse(await this.repository.createTemplate(session.tenantId, request));
    await this.operationLogs?.record({
      session,
      action: "template.create",
      targetType: "template",
      targetId: template.template_id
    });
    return template;
  }

  async updateTemplate(
    session: AdminSession,
    templateId: string,
    request: UpdateAdminTemplateRequest
  ): Promise<AdminTemplate> {
    requireTenantAdminRole(session, "admin");
    const template = adminTemplateSchema.parse(await this.repository.updateTemplate(session.tenantId, templateId, request));
    await this.operationLogs?.record({
      session,
      action: "template.update",
      targetType: "template",
      targetId: templateId
    });
    return template;
  }

  async setDefaultTemplate(session: AdminSession, templateId: string): Promise<AdminTemplate> {
    requireTenantAdminRole(session, "admin");
    const template = adminTemplateSchema.parse(await this.repository.setDefaultTemplate(session.tenantId, templateId));
    await this.operationLogs?.record({
      session,
      action: "template.set_default",
      targetType: "template",
      targetId: templateId
    });
    return template;
  }

  private async requireVideoCapability(tenantId: string): Promise<void> {
    const capability = await this.videoFeatures?.capability(tenantId);
    if (!capability?.enabled) throw new ForbiddenException("company video feature is not enabled");
  }
}
