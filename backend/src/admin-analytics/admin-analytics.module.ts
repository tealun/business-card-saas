import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminAnalyticsController } from "./admin-analytics.controller.js";
import { AdminAnalyticsRepository } from "./admin-analytics.repository.js";
import { AdminAnalyticsService } from "./admin-analytics.service.js";

@Module({
  imports: [AdminAuthModule, DatabaseModule],
  controllers: [AdminAnalyticsController],
  providers: [AdminAnalyticsRepository, AdminAnalyticsService]
})
export class AdminAnalyticsModule {}
