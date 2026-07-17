import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformCommercialController, TenantCommercialController } from "./admin-commercial.controller.js";
import { AdminCommercialRepository } from "./admin-commercial.repository.js";
import { AdminCommercialService } from "./admin-commercial.service.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";

@Module({
  imports: [AdminAuthModule, DatabaseModule, AdminOperationLogModule],
  controllers: [TenantCommercialController, PlatformCommercialController],
  providers: [AdminCommercialRepository, AdminCommercialService]
})
export class AdminCommercialModule {}
