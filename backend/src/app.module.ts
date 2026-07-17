import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { HealthController } from "./health.controller.js";
import { MetricsController } from "./metrics/metrics.controller.js";
import { AdminAuthModule } from "./admin-auth/admin-auth.module.js";
import { AdminDatabaseModule } from "./admin-database/admin-database.module.js";
import { AdminConfigModule } from "./admin-config/admin-config.module.js";
import { AdminManagementModule } from "./admin-management/admin-management.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { PublicCardModule } from "./public-card/public-card.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { EmployeeCardModule } from "./employee/employee-card.module.js";
import { OwnerBootstrapModule } from "./admin-bootstrap/owner-bootstrap.module.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { ApiResponseInterceptor } from "./common/api-response.interceptor.js";
import { WecomModule } from "./wecom/wecom.module.js";
import { WecomSensitiveModule } from "./wecom-sensitive/wecom-sensitive.module.js";
import { ConfigModule } from "./config/config.module.js";
import { StorageModule } from "./storage/storage.module.js";
import { CompanyVideoFeatureModule } from "./company-video-feature/company-video-feature.module.js";
import { DemoAssetsModule } from "./demo-assets/demo-assets.module.js";
import { PlatformTenantModule } from "./platform-tenants/platform-tenant.module.js";
import { AdminObservabilityModule } from "./admin-observability/admin-observability.module.js";
import { AdminOperationLogModule } from "./admin-operation-log/admin-operation-log.module.js";
import { AdminAnalyticsModule } from "./admin-analytics/admin-analytics.module.js";
import { AdminCommercialModule } from "./admin-commercial/admin-commercial.module.js";

@Module({
  imports: [
    ConfigModule,
    StorageModule,
    DemoAssetsModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "error" : "debug"),
        // Keep bearer tokens, login codes, and contact PII out of request logs.
        redact: {
          paths: [
            "req.headers.authorization",
            "req.body.code",
            "req.body.mobile",
            "req.body.phone",
            "req.body.email",
            "req.body.wechat_id",
            "req.body.wechatId",
            "req.query.code",
            "req.query.mobile",
            "req.query.phone",
            "req.query.email",
            "req.query.wechat_id",
            "req.query.wechatId"
          ],
          censor: "[redacted]"
        }
      }
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          // A company office commonly shares one public NAT address. Keep a
          // broad abuse ceiling without making coworkers consume a tiny
          // shared request budget during normal card browsing.
          limit: 300
        }
      ]
    }),
    DatabaseModule,
    PublicCardModule,
    AuthModule,
    EmployeeCardModule,
    OwnerBootstrapModule,
    WecomModule,
    WecomSensitiveModule,
    AdminAuthModule,
    AdminDatabaseModule,
    AdminManagementModule,
    AdminConfigModule,
    AdminAnalyticsModule,
    AdminCommercialModule,
    AdminObservabilityModule,
    AdminOperationLogModule,
    CompanyVideoFeatureModule,
    PlatformTenantModule
  ],
  controllers: [HealthController, MetricsController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard
    }
  ]
})
export class AppModule {}
