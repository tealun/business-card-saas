import { Injectable } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { requireTenantAdminRole } from "../admin-auth/admin-rbac.js";
import {
  adminAnalyticsResponseSchema,
  type AdminAnalyticsQuery,
  type AdminAnalyticsResponse
} from "../contracts/admin-analytics.js";
import { AdminAnalyticsRepository } from "./admin-analytics.repository.js";

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly repository: AdminAnalyticsRepository) {}

  async getTenantAnalytics(session: AdminSession, query: AdminAnalyticsQuery): Promise<AdminAnalyticsResponse> {
    requireTenantAdminRole(session, "auditor");
    return adminAnalyticsResponseSchema.parse(await this.repository.getTenantAnalytics(session, query));
  }
}
