import { Module } from "@nestjs/common";
import { OwnerBootstrapRepository } from "./owner-bootstrap.repository.js";
import { OwnerBootstrapService } from "./owner-bootstrap.service.js";

@Module({
  providers: [OwnerBootstrapRepository, OwnerBootstrapService],
  exports: [OwnerBootstrapRepository, OwnerBootstrapService]
})
export class OwnerBootstrapModule {}
