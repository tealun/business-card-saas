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

  /**
   * 平台租户列表。
   */
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

  /**
   * 平台租户详情。
   */
  @Get(":tenantId")
  get(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.get(requireAdminSession(req), tenantId);
  }

  /**
   * 平台触发指定租户成员同步。
   */
  @Post(":tenantId/sync")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  syncMembers(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.syncTenantMembers(requireAdminSession(req), tenantId);
  }

  /**
   * 平台创建本地企业空壳。
   */
  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createLocal(@Req() req: AdminRequest, @Body() body: unknown) {
    const input = createLocalEnterpriseSchema.parse(body);
    return this.service.createLocalEnterprise(requireAdminSession(req), {
      name: input.name,
      memberLimit: input.member_limit ?? null
    });
  }

  /**
   * 为未认领本地企业生成认领 token。
   */
  @Post(":tenantId/claim-token")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createLocalClaimToken(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.createLocalEnterpriseClaimToken(requireAdminSession(req), tenantId);
  }

  /**
   * 重命名平台创建的本地企业。
   */
  @Patch(":tenantId")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  renameLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string, @Body() body: unknown) {
    const input = renameLocalEnterpriseSchema.parse(body);
    return this.service.renameLocalEnterprise(requireAdminSession(req), tenantId, input.name);
  }

  /**
   * 禁用平台创建的本地企业。
   */
  @Post(":tenantId/disable")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  disableLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.setLocalEnterpriseStatus(requireAdminSession(req), tenantId, "disabled");
  }

  /**
   * 启用平台创建的本地企业。
   */
  @Post(":tenantId/enable")
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  enableLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.setLocalEnterpriseStatus(requireAdminSession(req), tenantId, "active");
  }

  /**
   * 软删除平台创建的本地企业。
   */
  @Delete(":tenantId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  deleteLocal(@Req() req: AdminRequest, @Param("tenantId") tenantId: string) {
    return this.service.deleteLocalEnterprise(requireAdminSession(req), tenantId);
  }
}

