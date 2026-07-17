import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminObservabilityController } from "./admin-observability.controller.js";
import { AdminObservabilityRepository } from "./admin-observability.repository.js";
import { AdminObservabilityService } from "./admin-observability.service.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";

@Module({
  imports: [AdminAuthModule, DatabaseModule, AdminOperationLogModule],
  controllers: [AdminObservabilityController],
  providers: [AdminObservabilityRepository, AdminObservabilityService]
})
export class AdminObservabilityModule {}
