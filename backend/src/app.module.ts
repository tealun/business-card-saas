import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PublicCardModule } from "./public-card/public-card.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { EmployeeCardModule } from "./employee/employee-card.module.js";

@Module({
  imports: [PrismaModule, PublicCardModule, AuthModule, EmployeeCardModule],
  controllers: [HealthController]
})
export class AppModule {}
