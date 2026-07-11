import { Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module.js";
import { PublicCardModule } from "../public-card/public-card.module.js";
import { CardFieldCipherService } from "../admin-management/card-field-cipher.service.js";
import { StorageModule } from "../storage/storage.module.js";
import { EmployeeCardController } from "./employee-card.controller.js";
import { EmployeeCardRepository } from "./employee-card.repository.js";
import { EmployeeCardService } from "./employee-card.service.js";

@Module({
  imports: [SessionModule, PublicCardModule, StorageModule],
  controllers: [EmployeeCardController],
  providers: [EmployeeCardRepository, EmployeeCardService, CardFieldCipherService],
  exports: [EmployeeCardService]
})
export class EmployeeCardModule {}
