import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { PlatformTenantController } from "./platform-tenant.controller.js";
import { PlatformTenantRepository } from "./platform-tenant.repository.js";
import { PlatformTenantService } from "./platform-tenant.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [PlatformTenantController],
  providers: [PlatformTenantRepository, PlatformTenantService]
})
export class PlatformTenantModule {}

