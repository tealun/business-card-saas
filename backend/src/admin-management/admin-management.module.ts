import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { EmployeeCardModule } from "../employee/employee-card.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { AdminManagementController } from "./admin-management.controller.js";
import { AdminManagementRepository } from "./admin-management.repository.js";
import { AdminManagementService } from "./admin-management.service.js";

@Module({
  imports: [AdminAuthModule, EmployeeCardModule, WecomModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementRepository, AdminManagementService]
})
export class AdminManagementModule {}
