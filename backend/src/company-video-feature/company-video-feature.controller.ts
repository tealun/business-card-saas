import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { platformVideoFeatureRequestSchema, tenantVideoFeatureRequestSchema } from "../contracts/company-video-feature.js";
import { CompanyVideoFeatureService } from "./company-video-feature.service.js";

@Controller("admin/features/company-video")
@UseGuards(AdminAuthGuard)
export class CompanyVideoFeatureController {
  constructor(private readonly service: CompanyVideoFeatureService) {}

  @Get()
  get(@Req() req: AdminRequest) {
    const session = requireAdminSession(req);
    requireTenantAdminRole(session, "auditor");
    return this.service.capability(session.tenantId);
  }
}

@Controller("admin/platform/features/company-video")
@UseGuards(AdminAuthGuard)
export class PlatformVideoFeatureController {
  constructor(private readonly service: CompanyVideoFeatureService) {}

  @Get()
  get(@Req() req: AdminRequest) {
    return this.service.getPlatform(requireAdminSession(req));
  }

  @Put()
  put(@Req() req: AdminRequest, @Body() body: unknown) {
    return this.service.updatePlatform(requireAdminSession(req), platformVideoFeatureRequestSchema.parse(body));
  }

  @Get("tenants")
  list(
    @Req() req: AdminRequest,
    @Query("search") search = "",
    @Query("page") page = "1",
    @Query("page_size") pageSize = "20"
  ) {
    return this.service.listTenants(
      requireAdminSession(req),
      search,
      Math.max(1, Number(page) || 1),
      Math.min(100, Math.max(1, Number(pageSize) || 20))
    );
  }

  @Put("tenants/:tenantId")
  update(@Req() req: AdminRequest, @Param("tenantId") tenantId: string, @Body() body: unknown) {
    return this.service.updateTenant(requireAdminSession(req), tenantId, tenantVideoFeatureRequestSchema.parse(body));
  }
}
