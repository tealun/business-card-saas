import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminObservabilityController } from "./admin-observability.controller.js";
import { AdminObservabilityRepository } from "./admin-observability.repository.js";
import { AdminObservabilityService } from "./admin-observability.service.js";

@Module({
  imports: [AdminAuthModule, DatabaseModule],
  controllers: [AdminObservabilityController],
  providers: [AdminObservabilityRepository, AdminObservabilityService]
})
export class AdminObservabilityModule {}
