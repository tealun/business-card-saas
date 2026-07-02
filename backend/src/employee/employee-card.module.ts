import { Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module.js";
import { EmployeeCardController } from "./employee-card.controller.js";
import { EmployeeCardRepository } from "./employee-card.repository.js";
import { EmployeeCardService } from "./employee-card.service.js";

@Module({
  imports: [SessionModule],
  controllers: [EmployeeCardController],
  providers: [EmployeeCardRepository, EmployeeCardService]
})
export class EmployeeCardModule {}
