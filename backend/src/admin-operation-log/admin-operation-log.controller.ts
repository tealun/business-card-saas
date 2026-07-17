import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { adminOperationLogQuerySchema, platformOperationLogQuerySchema } from "../contracts/admin-operation-log.js";
import { AdminOperationLogService } from "./admin-operation-log.service.js";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminOperationLogController {
  constructor(private readonly operationLogs: AdminOperationLogService) {}

  @Get("operation-logs")
  tenantOperationLogs(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.operationLogs.listTenantLogs(requireAdminSession(request), adminOperationLogQuerySchema.parse(query));
  }

  @Get("platform/operation-logs")
  platformOperationLogs(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.operationLogs.listPlatformLogs(requireAdminSession(request), platformOperationLogQuerySchema.parse(query));
  }
}
