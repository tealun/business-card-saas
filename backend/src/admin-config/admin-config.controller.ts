import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
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
    return this.config.getFieldSettings(this.session(request));
  }

  @Put("settings/fields")
  @Throttle({ adminMutation: { ttl: 60_000, limit: 20 } })
  updateFieldSettings(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.updateFieldSettings(
      this.session(request),
      updateAdminFieldSettingsRequestSchema.parse(body)
    );
  }

  @Get("company-profile")
  getCompanyProfile(@Req() request: AdminRequest) {
    return this.config.getCompanyProfile(this.session(request));
  }

  @Put("company-profile")
  @Throttle({ adminMutation: { ttl: 60_000, limit: 20 } })
  updateCompanyProfile(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.updateCompanyProfile(
      this.session(request),
      updateAdminCompanyProfileRequestSchema.parse(body)
    );
  }

  @Get("templates")
  listTemplates(@Req() request: AdminRequest) {
    return this.config.listTemplates(this.session(request));
  }

  @Post("templates")
  @Throttle({ adminMutation: { ttl: 60_000, limit: 20 } })
  createTemplate(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.createTemplate(this.session(request), createAdminTemplateRequestSchema.parse(body));
  }

  @Put("templates/:templateId")
  @Throttle({ adminMutation: { ttl: 60_000, limit: 20 } })
  updateTemplate(@Req() request: AdminRequest, @Param("templateId") templateId: string, @Body() body: unknown) {
    return this.config.updateTemplate(
      this.session(request),
      templateId,
      updateAdminTemplateRequestSchema.parse(body)
    );
  }

  @Put("templates/:templateId/default")
  @Throttle({ adminMutation: { ttl: 60_000, limit: 20 } })
  setDefaultTemplate(@Req() request: AdminRequest, @Param("templateId") templateId: string) {
    return this.config.setDefaultTemplate(this.session(request), templateId);
  }

  private session(request: AdminRequest) {
    if (!request.adminSession) {
      throw new Error("admin session missing after guard");
    }
    return request.adminSession;
  }
}
