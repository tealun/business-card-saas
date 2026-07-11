import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { StorageController } from "./storage.controller.js";
import { StorageService } from "./storage.service.js";

@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService]
})
export class StorageModule {}
