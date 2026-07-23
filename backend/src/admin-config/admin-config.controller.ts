import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import {
  createAdminTemplateRequestSchema,
  createAdminCompanyHonorRequestSchema,
  createAdminCompanyVideoRequestSchema,
  updateAdminCompanyProfileRequestSchema,
  updateAdminCompanyHonorRequestSchema,
  updateAdminCompanyVideoRequestSchema,
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

  @Get("company-honors")
  listCompanyHonors(@Req() request: AdminRequest) {
    return this.config.listCompanyHonors(requireAdminSession(request));
  }

  @Post("company-honors")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createCompanyHonor(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.createCompanyHonor(
      requireAdminSession(request),
      createAdminCompanyHonorRequestSchema.parse(body)
    );
  }

  @Put("company-honors/:honorId")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  updateCompanyHonor(@Req() request: AdminRequest, @Param("honorId") honorId: string, @Body() body: unknown) {
    return this.config.updateCompanyHonor(
      requireAdminSession(request),
      honorId,
      updateAdminCompanyHonorRequestSchema.parse(body)
    );
  }

  @Delete("company-honors/:honorId")
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  deleteCompanyHonor(@Req() request: AdminRequest, @Param("honorId") honorId: string) {
    return this.config.deleteCompanyHonor(requireAdminSession(request), honorId);
  }

  @Get("company-videos")
  listCompanyVideos(@Req() request: AdminRequest) {
    return this.config.listCompanyVideos(requireAdminSession(request));
  }

  @Post("company-videos")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createCompanyVideo(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.config.createCompanyVideo(
      requireAdminSession(request),
      createAdminCompanyVideoRequestSchema.parse(body)
    );
  }

  @Put("company-videos/:videoId")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  updateCompanyVideo(@Req() request: AdminRequest, @Param("videoId") videoId: string, @Body() body: unknown) {
    return this.config.updateCompanyVideo(
      requireAdminSession(request),
      videoId,
      updateAdminCompanyVideoRequestSchema.parse(body)
    );
  }

  @Delete("company-videos/:videoId")
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  deleteCompanyVideo(@Req() request: AdminRequest, @Param("videoId") videoId: string) {
    return this.config.deleteCompanyVideo(requireAdminSession(request), videoId);
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
