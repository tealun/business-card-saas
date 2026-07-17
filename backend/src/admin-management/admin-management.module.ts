import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { EmployeeCardModule } from "../employee/employee-card.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { AdminManagementController } from "./admin-management.controller.js";
import { AdminManagementRepository } from "./admin-management.repository.js";
import { AdminManagementService } from "./admin-management.service.js";
import { AdminOperationLogModule } from "../admin-operation-log/admin-operation-log.module.js";
import { CardFieldCipherService } from "./card-field-cipher.service.js";

@Module({
  imports: [AdminAuthModule, EmployeeCardModule, WecomModule, AdminOperationLogModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementRepository, AdminManagementService, CardFieldCipherService]
})
export class AdminManagementModule {}
