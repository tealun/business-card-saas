import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { AdminConfigController } from "./admin-config.controller.js";
import { AdminConfigRepository } from "./admin-config.repository.js";
import { AdminConfigService } from "./admin-config.service.js";

@Module({
  imports: [AdminAuthModule],
  controllers: [AdminConfigController],
  providers: [AdminConfigRepository, AdminConfigService]
})
export class AdminConfigModule {}
