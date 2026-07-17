import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { adminEventQuerySchema, adminListQuerySchema, updatePlatformAdminStatusRequestSchema } from "../contracts/admin-observability.js";
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

  @Get("platform/accounts")
  platformAccounts(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.observability.listPlatformAdmins(requireAdminSession(request), adminListQuerySchema.parse(query));
  }

  @Patch("platform/accounts/:adminId")
  updatePlatformAccountStatus(@Req() request: AdminRequest, @Param("adminId") adminId: string, @Body() body: unknown) {
    const input = updatePlatformAdminStatusRequestSchema.parse(body);
    return this.observability.updatePlatformAdminStatus(requireAdminSession(request), adminId, input.status);
  }

  @Get("platform/audit-events")
  platformAuditEvents(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.observability.listPlatformAuditEvents(requireAdminSession(request), adminEventQuerySchema.parse(query));
  }
}
