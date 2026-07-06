import { Injectable } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminCompanyProfileSchema,
  adminFieldSettingsResponseSchema,
  adminTemplateListResponseSchema,
  adminTemplateSchema,
  type AdminCompanyProfile,
  type AdminFieldSettingsResponse,
  type AdminTemplate,
  type AdminTemplateListResponse,
  type CreateAdminTemplateRequest,
  type UpdateAdminCompanyProfileRequest,
  type UpdateAdminFieldSettingsRequest,
  type UpdateAdminTemplateRequest
} from "../contracts/admin-config.js";
import { AdminConfigRepository } from "./admin-config.repository.js";

@Injectable()
export class AdminConfigService {
  constructor(private readonly repository: AdminConfigRepository) {}

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
    return adminCompanyProfileSchema.parse(
      await this.repository.updateCompanyProfile(
        { tenantId: session.tenantId, tenantName: session.tenantName },
        request
      )
    );
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
