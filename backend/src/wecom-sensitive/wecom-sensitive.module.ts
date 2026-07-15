import { Module } from "@nestjs/common";
import { EmployeeCardModule } from "../employee/employee-card.module.js";
import { SessionModule } from "../session/session.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { WecomSensitiveController } from "./wecom-sensitive.controller.js";
import { WecomSensitiveService } from "./wecom-sensitive.service.js";
import { WecomSensitiveStateRepository } from "./wecom-sensitive-state.repository.js";

@Module({
  imports: [EmployeeCardModule, SessionModule, WecomModule],
  controllers: [WecomSensitiveController],
  providers: [WecomSensitiveService, WecomSensitiveStateRepository]
})
export class WecomSensitiveModule {}
