import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import {
  adminMemberListQuerySchema,
  updateAdminMemberCardRequestSchema,
  updateAdminWecomSettingsRequestSchema
} from "../contracts/admin-management.js";
import { AdminManagementService } from "./admin-management.service.js";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminManagementController {
  constructor(private readonly management: AdminManagementService) {}

  @Get("overview")
  overview(@Req() request: AdminRequest) {
    return this.management.getOverview(requireAdminSession(request));
  }

  @Get("members")
  members(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.management.listMembers(requireAdminSession(request), adminMemberListQuerySchema.parse(query));
  }

  @Post("members/sync")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  syncMembers(@Req() request: AdminRequest) {
    return this.management.syncMembers(requireAdminSession(request));
  }

  @Get("sync-events")
  syncEvents(@Req() request: AdminRequest) {
    return this.management.listSyncEvents(requireAdminSession(request));
  }

  @Post("sync-events/retry")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  retrySyncEvents(@Req() request: AdminRequest) {
    return this.management.retryFailedSyncEvents(requireAdminSession(request));
  }

  @Post("platform/audit-events/retry")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  retryPlatformSyncEvents(@Req() request: AdminRequest, @Body() body: unknown) {
    const tenantId =
      body && typeof body === "object" && typeof (body as { tenant_id?: unknown }).tenant_id === "string"
        ? (body as { tenant_id: string }).tenant_id
        : undefined;
    return this.management.retryPlatformSyncEvents(requireAdminSession(request), tenantId);
  }

  @Get("wecom/settings")
  wecomSettings(@Req() request: AdminRequest) {
    return this.management.getWecomSettings(requireAdminSession(request));
  }

  @Put("wecom/settings")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateWecomSettings(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.management.updateWecomSettings(
      requireAdminSession(request),
      updateAdminWecomSettingsRequestSchema.parse(body)
    );
  }

  @Get("members/:memberIdentityId/card")
  memberCard(@Req() request: AdminRequest, @Param("memberIdentityId") memberIdentityId: string) {
    return this.management.getMemberCard(requireAdminSession(request), memberIdentityId);
  }

  @Put("members/:memberIdentityId/card")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateMemberCard(
    @Req() request: AdminRequest,
    @Param("memberIdentityId") memberIdentityId: string,
    @Body() body: unknown
  ) {
    return this.management.updateMemberCard(
      requireAdminSession(request),
      memberIdentityId,
      updateAdminMemberCardRequestSchema.parse(body)
    );
  }
}
