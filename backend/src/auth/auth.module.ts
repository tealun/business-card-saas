import { Module } from "@nestjs/common";
import { SessionModule } from "../session/session.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";

@Module({
  imports: [SessionModule],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService]
})
export class AuthModule {}
