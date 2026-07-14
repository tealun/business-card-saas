import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AdminConfigController } from "./admin-config.controller.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { AdminConfigService } from "./admin-config.service.js";
import { CompanyVideoFeatureModule } from "../company-video-feature/company-video-feature.module.js";

@Module({
  imports: [AdminAuthModule, CompanyVideoFeatureModule],
  controllers: [AdminConfigController],
  providers: [AdminConfigRepository, AdminConfigService]
})
export class AdminConfigModule {}
