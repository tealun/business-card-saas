import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { updateAdminMemberCardRequestSchema } from "../contracts/admin-management.js";
import { AdminManagementService } from "./admin-management.service.js";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminManagementController {
  constructor(private readonly management: AdminManagementService) {}

  @Get("overview")
  overview(@Req() request: AdminRequest) {
    return this.management.getOverview(this.session(request));
  }

  @Get("members")
  members(@Req() request: AdminRequest) {
    return this.management.listMembers(this.session(request));
  }

  @Post("members/sync")
  syncMembers(@Req() request: AdminRequest) {
    return this.management.syncMembers(this.session(request));
  }

  @Get("sync-events")
  syncEvents(@Req() request: AdminRequest) {
    return this.management.listSyncEvents(this.session(request));
  }

  @Post("sync-events/retry")
  retrySyncEvents(@Req() request: AdminRequest) {
    return this.management.retryFailedSyncEvents(this.session(request));
  }

  @Get("members/:memberIdentityId/card")
  memberCard(@Req() request: AdminRequest, @Param("memberIdentityId") memberIdentityId: string) {
    return this.management.getMemberCard(this.session(request), memberIdentityId);
  }

  @Put("members/:memberIdentityId/card")
  updateMemberCard(
    @Req() request: AdminRequest,
    @Param("memberIdentityId") memberIdentityId: string,
    @Body() body: unknown
  ) {
    return this.management.updateMemberCard(
      this.session(request),
      memberIdentityId,
      updateAdminMemberCardRequestSchema.parse(body)
    );
  }

  private session(request: AdminRequest) {
    if (!request.adminSession) {
      throw new Error("admin session missing after guard");
    }
    return request.adminSession;
  }
}
