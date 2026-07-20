import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { createLocalEnterpriseSchema, renameLocalEnterpriseSchema } from "../contracts/platform-tenant.js";
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

  @Post(":tenantId/sync")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  syncMembers(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.syncTenantMembers(requireAdminSession(req), tenantId);
  }

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createLocal(@Req() req: AdminRequest, @Body() body: unknown) {
    const input = createLocalEnterpriseSchema.parse(body);
    return this.service.createLocalEnterprise(requireAdminSession(req), {
      name: input.name,
      memberLimit: input.member_limit ?? null
    });
  }

  @Patch(":tenantId")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  renameLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string, @Body() body: unknown) {
    const input = renameLocalEnterpriseSchema.parse(body);
    return this.service.renameLocalEnterprise(requireAdminSession(req), tenantId, input.name);
  }

  @Post(":tenantId/disable")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  disableLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.setLocalEnterpriseStatus(requireAdminSession(req), tenantId, "disabled");
  }

  @Post(":tenantId/enable")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  enableLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.setLocalEnterpriseStatus(requireAdminSession(req), tenantId, "active");
  }

  @Delete(":tenantId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  deleteLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.deleteLocalEnterprise(requireAdminSession(req), tenantId);
  }
}

