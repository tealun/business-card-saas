import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { AdminAuthGuard, type AdminRequest } from "../admin-auth/admin-auth.guard.js";
import { requireAdminSession } from "../admin-auth/admin-session.util.js";
import { adminAnalyticsQuerySchema } from "../contracts/admin-analytics.js";
import { AdminAnalyticsService } from "./admin-analytics.service.js";

@Controller("admin/analytics")
@UseGuards(AdminAuthGuard)
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get()
  overview(@Req() request: AdminRequest, @Query() query: unknown) {
    return this.analytics.getTenantAnalytics(requireAdminSession(request), adminAnalyticsQuerySchema.parse(query));
  }
}
