import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { adminMemberListQuerySchema, updateAdminMemberCardRequestSchema } from "../contracts/admin-management.js";
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
