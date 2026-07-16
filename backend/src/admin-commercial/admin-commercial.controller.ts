import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { quotaAdjustmentRequestSchema } from "../contracts/admin-commercial.js";
import { AdminCommercialService } from "./admin-commercial.service.js";

@Controller("admin/commercial")
@UseGuards(AdminAuthGuard)
export class TenantCommercialController {
  constructor(private readonly commercial: AdminCommercialService) {}

  @Get()
  tenantCommercial(@Req() request: AdminRequest) {
    return this.commercial.tenantCommercial(requireAdminSession(request));
  }
}

@Controller("admin/platform/commercial")
@UseGuards(AdminAuthGuard)
export class PlatformCommercialController {
  constructor(private readonly commercial: AdminCommercialService) {}

  @Get()
  platformCommercial(@Req() request: AdminRequest) {
    return this.commercial.platformCommercial(requireAdminSession(request));
  }

  @Post("quota-adjustments")
  createQuotaAdjustment(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.commercial.createQuotaAdjustment(requireAdminSession(request), quotaAdjustmentRequestSchema.parse(body));
  }
}
