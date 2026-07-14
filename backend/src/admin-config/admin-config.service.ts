import { ForbiddenException, Injectable } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminCompanyProfileSchema,
  adminCompanyHonorListResponseSchema,
  adminCompanyHonorSchema,
  adminFieldSettingsResponseSchema,
  adminTemplateListResponseSchema,
  adminTemplateSchema,
  type AdminCompanyHonor,
  type AdminCompanyHonorListResponse,
  type AdminCompanyProfile,
  type AdminFieldSettingsResponse,
  type AdminTemplate,
  type AdminTemplateListResponse,
  type CreateAdminCompanyHonorRequest,
  type CreateAdminTemplateRequest,
  type UpdateAdminCompanyProfileRequest,
  type UpdateAdminCompanyHonorRequest,
  type UpdateAdminFieldSettingsRequest,
  type UpdateAdminTemplateRequest
} from "../contracts/admin-config.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { CompanyVideoFeatureService } from "../company-video-feature/company-video-feature.service.js";

@Injectable()
export class AdminConfigService {
  constructor(private readonly repository: AdminConfigRepository, private readonly videoFeatures?: CompanyVideoFeatureService) {}

  async getFieldSettings(session: AdminSession): Promise<AdminFieldSettingsResponse> {
    return adminFieldSettingsResponseSchema.parse({
      tenant_id: session.tenantId,
      fields: await this.repository.getFieldSettings(session.tenantId)
    });
  }

  async updateFieldSettings(
    session: AdminSession,
    request: UpdateAdminFieldSettingsRequest
  ): Promise<AdminFieldSettingsResponse> {
    requireAdminRole(session.role, "admin");
    return adminFieldSettingsResponseSchema.parse({
      tenant_id: session.tenantId,
      fields: await this.repository.updateFieldSettings(session.tenantId, request)
    });
  }

  async getCompanyProfile(session: AdminSession): Promise<AdminCompanyProfile> {
    return adminCompanyProfileSchema.parse(
      await this.repository.getCompanyProfile({ tenantId: session.tenantId, tenantName: session.tenantName })
    );
  }

  async updateCompanyProfile(
    session: AdminSession,
    request: UpdateAdminCompanyProfileRequest
  ): Promise<AdminCompanyProfile> {
    requireAdminRole(session.role, "admin");
    if (request.intro_blocks?.some((block) => block.type === "video")) {
      const capability = await this.videoFeatures?.capability(session.tenantId);
      if (!capability?.enabled) throw new ForbiddenException("company video feature is not enabled");
      for (const block of request.intro_blocks) {
        if (block.type === "video" && !(await this.repository.publishedVideoExists(session.tenantId, block.video_id))) {
          throw new ForbiddenException("video block must reference a published company video");
        }
      }
    }
    return adminCompanyProfileSchema.parse(
      await this.repository.updateCompanyProfile(
        { tenantId: session.tenantId, tenantName: session.tenantName },
        request
      )
    );
  }

  async listCompanyHonors(session: AdminSession): Promise<AdminCompanyHonorListResponse> {
    return adminCompanyHonorListResponseSchema.parse({
      tenant_id: session.tenantId,
      items: await this.repository.listCompanyHonors(session.tenantId)
    });
  }

  async createCompanyHonor(
    session: AdminSession,
    request: CreateAdminCompanyHonorRequest
  ): Promise<AdminCompanyHonor> {
    requireAdminRole(session.role, "admin");
    return adminCompanyHonorSchema.parse(await this.repository.createCompanyHonor(session.tenantId, request));
  }

  async updateCompanyHonor(
    session: AdminSession,
    honorId: string,
    request: UpdateAdminCompanyHonorRequest
  ): Promise<AdminCompanyHonor> {
    requireAdminRole(session.role, "admin");
    return adminCompanyHonorSchema.parse(await this.repository.updateCompanyHonor(session.tenantId, honorId, request));
  }

  async deleteCompanyHonor(session: AdminSession, honorId: string): Promise<void> {
    requireAdminRole(session.role, "admin");
    await this.repository.deleteCompanyHonor(session.tenantId, honorId);
  }

  async listTemplates(session: AdminSession): Promise<AdminTemplateListResponse> {
    return adminTemplateListResponseSchema.parse({
      tenant_id: session.tenantId,
      items: await this.repository.listTemplates(session.tenantId)
    });
  }

  async createTemplate(session: AdminSession, request: CreateAdminTemplateRequest): Promise<AdminTemplate> {
    requireAdminRole(session.role, "admin");
    return adminTemplateSchema.parse(await this.repository.createTemplate(session.tenantId, request));
  }

  async updateTemplate(
    session: AdminSession,
    templateId: string,
    request: UpdateAdminTemplateRequest
  ): Promise<AdminTemplate> {
    requireAdminRole(session.role, "admin");
    return adminTemplateSchema.parse(await this.repository.updateTemplate(session.tenantId, templateId, request));
  }

  async setDefaultTemplate(session: AdminSession, templateId: string): Promise<AdminTemplate> {
    requireAdminRole(session.role, "admin");
    return adminTemplateSchema.parse(await this.repository.setDefaultTemplate(session.tenantId, templateId));
  }
}
