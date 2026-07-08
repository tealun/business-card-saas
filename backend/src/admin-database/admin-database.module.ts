import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../admin-auth/admin-auth.module.js";
import { ConfigModule } from "../config/config.module.js";
import { AdminDatabaseController } from "./admin-database.controller.js";
import { AdminDatabaseService } from "./admin-database.service.js";

@Module({
  imports: [AdminAuthModule, ConfigModule],
  controllers: [AdminDatabaseController],
  providers: [AdminDatabaseService]
})
export class AdminDatabaseModule {}
