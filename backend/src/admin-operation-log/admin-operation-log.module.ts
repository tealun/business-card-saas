import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AdminOperationLogController } from "./admin-operation-log.controller.js";
import { AdminOperationLogRepository } from "./admin-operation-log.repository.js";
import { AdminOperationLogService } from "./admin-operation-log.service.js";

@Module({
  imports: [AdminAuthModule, DatabaseModule],
  controllers: [AdminOperationLogController],
  providers: [AdminOperationLogRepository, AdminOperationLogService],
  exports: [AdminOperationLogService]
})
export class AdminOperationLogModule {}
