import { Injectable, NotFoundException } from "@nestjs/common";
import { randomToken } from "../common/id.js";
import type {
  AdminCompanyProfile,
  AdminFieldRule,
  AdminTemplate,
  CreateAdminTemplateRequest,
  UpdateAdminCompanyProfileRequest,
  UpdateAdminFieldSettingsRequest,
  UpdateAdminTemplateRequest
} from "../contracts/admin-config.js";

@Injectable()
export class AdminConfigRepository {
  private readonly fieldSettings = new Map<string, AdminFieldRule[]>();
  private readonly companyProfiles = new Map<string, AdminCompanyProfile>();
  private readonly templates = new Map<string, AdminTemplate[]>();

  getFieldSettings(tenantId: string): AdminFieldRule[] {
    const current = this.fieldSettings.get(tenantId) ?? defaultFieldRules();
    this.fieldSettings.set(tenantId, cloneFieldRules(current));
    return cloneFieldRules(current);
  }

  updateFieldSettings(tenantId: string, request: UpdateAdminFieldSettingsRequest): AdminFieldRule[] {
    const next = cloneFieldRules(request.fields);
    this.fieldSettings.set(tenantId, next);
    return cloneFieldRules(next);
  }

  getCompanyProfile(input: { tenantId: string; tenantName: string }): AdminCompanyProfile {
    const current = this.companyProfiles.get(input.tenantId) ?? defaultCompanyProfile(input);
    this.companyProfiles.set(input.tenantId, cloneCompanyProfile(current));
    return cloneCompanyProfile(current);
  }

  updateCompanyProfile(
    input: { tenantId: string; tenantName: string },
    request: UpdateAdminCompanyProfileRequest
  ): AdminCompanyProfile {
    const current = this.getCompanyProfile(input);
    const next: AdminCompanyProfile = {
      tenant_id: input.tenantId,
      display_name: request.display_name ?? current.display_name,
      short_name: request.short_name !== undefined ? request.short_name : current.short_name,
      logo_url: request.logo_url !== undefined ? request.logo_url : current.logo_url,
      website_url: request.website_url !== undefined ? request.website_url : current.website_url,
      address: request.address !== undefined ? request.address : current.address,
      intro_blocks: request.intro_blocks ?? current.intro_blocks,
      visible: request.visible ?? current.visible,
      status: request.status ?? current.status
    };
    this.companyProfiles.set(input.tenantId, cloneCompanyProfile(next));
    return cloneCompanyProfile(next);
  }

  listTemplates(tenantId: string): AdminTemplate[] {
    const current = this.templates.get(tenantId) ?? [defaultTemplate()];
    this.templates.set(tenantId, cloneTemplates(current));
    return cloneTemplates(current);
  }

  createTemplate(tenantId: string, request: CreateAdminTemplateRequest): AdminTemplate {
    const current = this.listTemplates(tenantId);
    const template: AdminTemplate = {
      template_id: randomToken("tpl", 10),
      name: request.name,
      is_default: current.length === 0,
      background_url: request.background_url ?? null,
      logo_url: request.logo_url ?? null,
      color_scheme: request.color_scheme ?? { primary: "#1677ff", surface: "#ffffff" },
      layout: request.layout ?? { variant: "horizontal-business" },
      status: "active"
    };
    const next = [...current, template];
    this.templates.set(tenantId, cloneTemplates(next));
    return { ...template };
  }

  updateTemplate(tenantId: string, templateId: string, request: UpdateAdminTemplateRequest): AdminTemplate {
    const current = this.listTemplates(tenantId);
    const index = current.findIndex((template) => template.template_id === templateId);
    if (index < 0) {
      throw new NotFoundException("template not found");
    }
    const existing = current[index]!;
    const updated: AdminTemplate = {
      template_id: existing.template_id,
      name: request.name ?? existing.name,
      is_default: existing.is_default,
      background_url: request.background_url !== undefined ? request.background_url : existing.background_url,
      logo_url: request.logo_url !== undefined ? request.logo_url : existing.logo_url,
      color_scheme: request.color_scheme ?? existing.color_scheme,
      layout: request.layout ?? existing.layout,
      status: request.status ?? existing.status
    };
    current[index] = updated;
    this.templates.set(tenantId, cloneTemplates(current));
    return { ...updated };
  }

  setDefaultTemplate(tenantId: string, templateId: string): AdminTemplate {
    const current = this.listTemplates(tenantId);
    const target = current.find((template) => template.template_id === templateId);
    if (!target) {
      throw new NotFoundException("template not found");
    }
    const next = current.map((template) => ({
      ...template,
      is_default: template.template_id === templateId
    }));
    this.templates.set(tenantId, cloneTemplates(next));
    return { ...next.find((template) => template.template_id === templateId)! };
  }
}

function defaultFieldRules(): AdminFieldRule[] {
  return [
    { field_key: "display_name", label: "姓名", locked: false, employee_editable: true, default_visible: true },
    { field_key: "title", label: "职位", locked: false, employee_editable: true, default_visible: true },
    { field_key: "mobile", label: "手机", locked: false, employee_editable: true, default_visible: false },
    { field_key: "phone", label: "座机", locked: false, employee_editable: true, default_visible: true },
    { field_key: "email", label: "邮箱", locked: false, employee_editable: true, default_visible: true },
    { field_key: "wechat_id", label: "微信", locked: false, employee_editable: true, default_visible: false },
    { field_key: "address", label: "地址", locked: false, employee_editable: true, default_visible: true }
  ];
}

function defaultCompanyProfile(input: { tenantId: string; tenantName: string }): AdminCompanyProfile {
  return {
    tenant_id: input.tenantId,
    display_name: input.tenantName,
    short_name: null,
    logo_url: null,
    website_url: null,
    address: null,
    intro_blocks: [],
    visible: true,
    status: "draft"
  };
}

function defaultTemplate(): AdminTemplate {
  return {
    template_id: "tpl_demo_business",
    name: "默认商务模板",
    is_default: true,
    background_url: null,
    logo_url: null,
    color_scheme: { primary: "#1677ff", surface: "#ffffff" },
    layout: { variant: "horizontal-business" },
    status: "active"
  };
}

function cloneFieldRules(rules: AdminFieldRule[]): AdminFieldRule[] {
  return rules.map((rule) => ({ ...rule }));
}

function cloneCompanyProfile(profile: AdminCompanyProfile): AdminCompanyProfile {
  return {
    ...profile,
    intro_blocks: profile.intro_blocks.map((block) => ({ ...block }))
  };
}

function cloneTemplates(templates: AdminTemplate[]): AdminTemplate[] {
  return templates.map((template) => ({
    ...template,
    color_scheme: { ...template.color_scheme },
    layout: { ...template.layout }
  }));
}
