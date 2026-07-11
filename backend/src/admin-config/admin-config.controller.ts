import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import {
  createAdminTemplateRequestSchema,
  updateAdminCompanyProfileRequestSchema,
  updateAdminFieldSettingsRequestSchema,
  updateAdminTemplateRequestSchema
} from "../contracts/admin-config.js";
import { AdminConfigService } from "./admin-config.service.js";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminConfigController {
  constructor(private readonly config: AdminConfigService) {}

  @Get("settings/fields")
  getFieldSettings(@Req() request: AdminRequest) {
    return this.config.getFieldSettings(requireAdminSession(request));
  }

  @Put("settings/fields")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateFieldSettings(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.updateFieldSettings(
      requireAdminSession(request),
      updateAdminFieldSettingsRequestSchema.parse(body)
    );
  }

  @Get("company-profile")
  getCompanyProfile(@Req() request: AdminRequest) {
    return this.config.getCompanyProfile(requireAdminSession(request));
  }

  @Put("company-profile")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateCompanyProfile(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.updateCompanyProfile(
      requireAdminSession(request),
      updateAdminCompanyProfileRequestSchema.parse(body)
    );
  }

  @Get("templates")
  listTemplates(@Req() request: AdminRequest) {
    return this.config.listTemplates(requireAdminSession(request));
  }

  @Post("templates")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createTemplate(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.createTemplate(requireAdminSession(request), createAdminTemplateRequestSchema.parse(body));
  }

  @Put("templates/:templateId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateTemplate(@Req() request: AdminRequest, @Param("templateId") templateId: string, @Body() body: unknown) {
    return this.config.updateTemplate(
      requireAdminSession(request),
      templateId,
      updateAdminTemplateRequestSchema.parse(body)
    );
  }

  @Put("templates/:templateId/default")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  setDefaultTemplate(@Req() request: AdminRequest, @Param("templateId") templateId: string) {
    return this.config.setDefaultTemplate(requireAdminSession(request), templateId);
  }
}
