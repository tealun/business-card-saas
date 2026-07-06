import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { EmployeeCardModule } from "../employee/employee-card.module.js";
import { AdminManagementController } from "./admin-management.controller.js";
import { AdminManagementService } from "./admin-management.service.js";

@Module({
  imports: [AdminAuthModule, EmployeeCardModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementService]
})
export class AdminManagementModule {}
