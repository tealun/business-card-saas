import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import {
  adminEventQuerySchema,
  adminListQuerySchema,
  platformAccountCreateRequestSchema,
  platformAccountRoleUpdateRequestSchema,
  updatePlatformAdminStatusRequestSchema,
  updateTenantAdminStatusRequestSchema
} from "../contracts/admin-observability.js";
import { AdminObservabilityService } from "./admin-observability.service.js";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminObservabilityController {
  constructor(private readonly observability: AdminObservabilityService) {}

  @Get("admins")
  tenantAdmins(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.observability.listTenantAdmins(requireAdminSession(request), adminListQuerySchema.parse(query));
  }

  @Get("audit-events")
  tenantAuditEvents(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.observability.listTenantAuditEvents(requireAdminSession(request), adminEventQuerySchema.parse(query));
  }

  @Patch("admins/:adminId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateTenantAdminStatus(@Req() request: AdminRequest, @Param("adminId") adminId: string, @Body() body: unknown) {
    const input = updateTenantAdminStatusRequestSchema.parse(body);
    return this.observability.updateTenantAdminStatus(requireAdminSession(request), adminId, input.status);
  }

  @Get("platform/accounts")
  platformAccounts(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.observability.listPlatformAdmins(requireAdminSession(request), adminListQuerySchema.parse(query));
  }

  @Patch("platform/accounts/:adminId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updatePlatformAccountStatus(@Req() request: AdminRequest, @Param("adminId") adminId: string, @Body() body: unknown) {
    const input = updatePlatformAdminStatusRequestSchema.parse(body);
    return this.observability.updatePlatformAdminStatus(requireAdminSession(request), adminId, input.status);
  }

  @Post("platform/accounts")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  createPlatformAccount(@Req() request: AdminRequest, @Body() body: unknown) {
    const input = platformAccountCreateRequestSchema.parse(body);
    return this.observability.createPlatformAccount(requireAdminSession(request), input);
  }

  @Patch("platform/accounts/:adminId/role")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updatePlatformAccountRole(@Req() request: AdminRequest, @Param("adminId") adminId: string, @Body() body: unknown) {
    const input = platformAccountRoleUpdateRequestSchema.parse(body);
    return this.observability.updatePlatformAccountRole(requireAdminSession(request), adminId, input.role);
  }

  @Delete("platform/accounts/:adminId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  deletePlatformAccount(@Req() request: AdminRequest, @Param("adminId") adminId: string) {
    return this.observability.deletePlatformAccount(requireAdminSession(request), adminId);
  }

  @Get("platform/audit-events")
  platformAuditEvents(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.observability.listPlatformAuditEvents(requireAdminSession(request), adminEventQuerySchema.parse(query));
  }
}
