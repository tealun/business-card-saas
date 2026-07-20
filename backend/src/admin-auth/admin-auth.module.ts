import { Module } from "@nestjs/common";
import { AdminOperationLogRepository } from "../admin-operation-log/admin-operation-log.repository.js";
import { AdminOperationLogService } from "../admin-operation-log/admin-operation-log.service.js";
import { OwnerBootstrapModule } from "../admin-bootstrap/owner-bootstrap.module.js";
import { ConfigModule } from "../config/config.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionController } from "./admin-session.controller.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { AdminWecomAuthStateRepository } from "./admin-wecom-auth-state.repository.js";
import { AdminWecomScanAuthService } from "./admin-wecom-scan-auth.service.js";
import { AdminWecomScanRepository } from "./admin-wecom-scan.repository.js";
import { PlatformAdminRepository } from "./platform-admin.repository.js";
import { PlatformAdminService } from "./platform-admin.service.js";

@Module({
  imports: [OwnerBootstrapModule, WecomModule, ConfigModule],
  controllers: [AdminAuthController, AdminSessionController],
  providers: [
    AdminAuthGuard,
    AdminAuthService,
    AdminSessionTokenService,
    AdminWecomAuthStateRepository,
    AdminWecomScanAuthService,
    AdminWecomScanRepository,
    AdminOperationLogRepository,
    AdminOperationLogService,
    PlatformAdminRepository,
    PlatformAdminService
  ],
  exports: [AdminAuthGuard, AdminAuthService, AdminSessionTokenService, PlatformAdminService, OwnerBootstrapModule]
})
export class AdminAuthModule {}
