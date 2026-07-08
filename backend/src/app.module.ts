import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { HealthController } from "./health.controller.js";
import { MetricsController } from "./metrics/metrics.controller.js";
import { AdminAuthModule } from "./admin-auth/admin-auth.module.js";
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
import { ConfigModule } from "./config/config.module.js";

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "error" : "debug")
      }
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60_000,
          limit: 100
        }
      ]
    }),
    DatabaseModule,
    PublicCardModule,
    AuthModule,
    EmployeeCardModule,
    OwnerBootstrapModule,
    WecomModule,
    AdminAuthModule,
    AdminManagementModule,
    AdminConfigModule
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
