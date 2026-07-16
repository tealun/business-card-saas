import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { PlatformTenantService } from "./platform-tenant.service.js";

@Controller("admin/platform/tenants")
@UseGuards(AdminAuthGuard)
export class PlatformTenantController {
  constructor(private readonly service: PlatformTenantService) {}

  @Get()
  list(
    @Req() req: AdminRequest,
    @Query("search") search = "",
    @Query("status") status = "all",
    @Query("page") page = "1",
    @Query("page_size") pageSize = "20"
  ) {
    return this.service.list(requireAdminSession(req), {
      search,
      status,
      page: Number(page),
      pageSize: Number(pageSize)
    });
  }

  @Get(":tenantId")
  get(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.get(requireAdminSession(req), tenantId);
  }
}

