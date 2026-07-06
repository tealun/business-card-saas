import { Module } from "@nestjs/common";
import { OwnerBootstrapModule } from "../admin-bootstrap/owner-bootstrap.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminSessionController } from "./admin-session.controller.js";
import { AdminSessionTokenService } from "./admin-session-token.service.js";

@Module({
  imports: [OwnerBootstrapModule, WecomModule],
  controllers: [AdminAuthController, AdminSessionController],
  providers: [AdminAuthGuard, AdminAuthService, AdminSessionTokenService],
  exports: [AdminAuthGuard, AdminAuthService, AdminSessionTokenService]
})
export class AdminAuthModule {}
