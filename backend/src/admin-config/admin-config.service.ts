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

  getFieldSettings(session: AdminSession): AdminFieldSettingsResponse {
    return adminFieldSettingsResponseSchema.parse({
      tenant_id: session.tenantId,
      fields: this.repository.getFieldSettings(session.tenantId)
    });
  }

  updateFieldSettings(session: AdminSession, request: UpdateAdminFieldSettingsRequest): AdminFieldSettingsResponse {
    requireAdminRole(session.role, "admin");
    return adminFieldSettingsResponseSchema.parse({
      tenant_id: session.tenantId,
      fields: this.repository.updateFieldSettings(session.tenantId, request)
    });
  }

  getCompanyProfile(session: AdminSession): AdminCompanyProfile {
    return adminCompanyProfileSchema.parse(
      this.repository.getCompanyProfile({ tenantId: session.tenantId, tenantName: session.tenantName })
    );
  }

  updateCompanyProfile(session: AdminSession, request: UpdateAdminCompanyProfileRequest): AdminCompanyProfile {
    requireAdminRole(session.role, "admin");
    return adminCompanyProfileSchema.parse(
      this.repository.updateCompanyProfile(
        { tenantId: session.tenantId, tenantName: session.tenantName },
        request
      )
    );
  }

  listTemplates(session: AdminSession): AdminTemplateListResponse {
    return adminTemplateListResponseSchema.parse({
      tenant_id: session.tenantId,
      items: this.repository.listTemplates(session.tenantId)
    });
  }

  createTemplate(session: AdminSession, request: CreateAdminTemplateRequest): AdminTemplate {
    requireAdminRole(session.role, "admin");
    return adminTemplateSchema.parse(this.repository.createTemplate(session.tenantId, request));
  }

  updateTemplate(session: AdminSession, templateId: string, request: UpdateAdminTemplateRequest): AdminTemplate {
    requireAdminRole(session.role, "admin");
    return adminTemplateSchema.parse(this.repository.updateTemplate(session.tenantId, templateId, request));
  }

  setDefaultTemplate(session: AdminSession, templateId: string): AdminTemplate {
    requireAdminRole(session.role, "admin");
    return adminTemplateSchema.parse(this.repository.setDefaultTemplate(session.tenantId, templateId));
  }
}
