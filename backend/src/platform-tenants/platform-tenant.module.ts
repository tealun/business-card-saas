import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { PlatformTenantController } from "./platform-tenant.controller.js";
import { PlatformTenantRepository } from "./platform-tenant.repository.js";
import { PlatformTenantService } from "./platform-tenant.service.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";
import { OwnerBootstrapModule } from "../admin-bootstrap/owner-bootstrap.module.js";

@Module({
  imports: [AdminAuthModule, WecomModule, AdminOperationLogModule, OwnerBootstrapModule],
  controllers: [PlatformTenantController],
  providers: [PlatformTenantRepository, PlatformTenantService]
})
export class PlatformTenantModule {}
