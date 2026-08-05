import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
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

  /**
   * 后台首页概览。
   */
  @Get("overview")
  overview(@Req() request: AdminRequest) {
    return this.management.getOverview(requireAdminSession(request));
  }

  /**
   * 后台成员列表。
   */
  @Get("members")
  members(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.management.listMembers(requireAdminSession(request), adminMemberListQuerySchema.parse(query));
  }

  /**
   * 手动同步当前租户企业微信成员。
   */
  @Post("members/sync")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  syncMembers(@Req() request: AdminRequest) {
    return this.management.syncMembers(requireAdminSession(request));
  }

  /**
   * 查询当前租户同步事件。
   */
  @Get("sync-events")
  syncEvents(@Req() request: AdminRequest) {
    return this.management.listSyncEvents(requireAdminSession(request));
  }

  /**
   * 重试当前租户失败同步事件。
   */
  @Post("sync-events/retry")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  retrySyncEvents(@Req() request: AdminRequest) {
    return this.management.retryFailedSyncEvents(requireAdminSession(request));
  }

  /**
   * 平台侧重试同步事件。
   *
   * body.tenant_id 可选；未传时由服务层执行平台范围重试。
   */
  @Post("platform/audit-events/retry")
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  retryPlatformSyncEvents(@Req() request: AdminRequest, @Body() body: unknown) {
    const tenantId =
      body && typeof body === "object" && typeof (body as { tenant_id?: unknown }).tenant_id === "string"
        ? (body as { tenant_id: string }).tenant_id
        : undefined;
    return this.management.retryPlatformSyncEvents(requireAdminSession(request), tenantId);
  }

  /**
   * 读取当前租户企业微信同步配置。
   */
  @Get("wecom/settings")
  wecomSettings(@Req() request: AdminRequest) {
    return this.management.getWecomSettings(requireAdminSession(request));
  }

  /**
   * 更新当前租户企业微信同步配置。
   */
  @Put("wecom/settings")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  updateWecomSettings(@Req() request: AdminRequest, @Body() body: unknown) {
    return this.management.updateWecomSettings(
      requireAdminSession(request),
      updateAdminWecomSettingsRequestSchema.parse(body)
    );
  }

  /**
   * 删除当前租户成员。
   */
  @Delete("members/:memberIdentityId")
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  deleteMember(@Req() request: AdminRequest, @Param("memberIdentityId") memberIdentityId: string) {
    return this.management.deleteMember(requireAdminSession(request), memberIdentityId);
  }

  /**
   * 读取当前租户成员名片。
   */
  @Get("members/:memberIdentityId/card")
  memberCard(@Req() request: AdminRequest, @Param("memberIdentityId") memberIdentityId: string) {
    return this.management.getMemberCard(requireAdminSession(request), memberIdentityId);
  }

  /**
   * 后台更新当前租户成员名片。
   */
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
