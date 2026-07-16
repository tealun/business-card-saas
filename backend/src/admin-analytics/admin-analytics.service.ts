import { Injectable } from "@nestjs/common";
import type { AdminSession } from "../admin-auth/admin-session.js";
import { adminAnalyticsResponseSchema, type AdminAnalyticsResponse } from "../contracts/admin-analytics.js";
import { AdminAnalyticsRepository } from "./admin-analytics.repository.js";

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly repository: AdminAnalyticsRepository) {}

  async getTenantAnalytics(session: AdminSession): Promise<AdminAnalyticsResponse> {
    return adminAnalyticsResponseSchema.parse(await this.repository.getTenantAnalytics(session));
  }
}
