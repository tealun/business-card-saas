import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { PublicCardModule } from "./public-card/public-card.module.js";

@Module({
  imports: [PrismaModule, PublicCardModule],
  controllers: [HealthController]
})
export class AppModule {}
