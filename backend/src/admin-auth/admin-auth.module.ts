import { Module } from "@nestjs/common";
import { OwnerBootstrapModule } from "../admin-bootstrap/owner-bootstrap.module.js";
import { ConfigModule } from "../config/config.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionController } from "./admin-session.controller.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";
import { PlatformAdminRepository } from "./platform-admin.repository.js";
import { PlatformAdminService } from "./platform-admin.service.js";

@Module({
  imports: [OwnerBootstrapModule, WecomModule, ConfigModule],
  controllers: [AdminAuthController, AdminSessionController],
  providers: [AdminAuthGuard, AdminAuthService, AdminSessionTokenService, PlatformAdminRepository, PlatformAdminService],
  exports: [AdminAuthGuard, AdminAuthService, AdminSessionTokenService, PlatformAdminService]
})
export class AdminAuthModule {}
