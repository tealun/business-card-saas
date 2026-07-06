import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { HealthController } from "./health.controller.js";
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

@Module({
  imports: [
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
  controllers: [HealthController],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiResponseInterceptor
    },
    {
      provide: APP_FILTER,
      useClass: ApiExceptionFilter
    }
  ]
})
export class AppModule {}
