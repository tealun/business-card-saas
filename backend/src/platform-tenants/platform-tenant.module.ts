import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { PlatformTenantController } from "./platform-tenant.controller.js";
import { PlatformTenantRepository } from "./platform-tenant.repository.js";
import { PlatformTenantService } from "./platform-tenant.service.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";
import { OwnerBootstrapModule } from "../admin-bootstrap/owner-bootstrap.module.js";
import { ConfigModule } from "../config/config.module.js";
import { WechatJoinQrService } from "../local-enterprise/wechat-join-qr.service.js";

@Module({
  imports: [AdminAuthModule, WecomModule, AdminOperationLogModule, OwnerBootstrapModule, ConfigModule],
  controllers: [PlatformTenantController],
  providers: [PlatformTenantRepository, PlatformTenantService, WechatJoinQrService]
})
export class PlatformTenantModule {}
