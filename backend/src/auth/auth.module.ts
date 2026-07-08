import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { SessionModule } from "../session/session.module.js";
import { WecomModule } from "../wecom/wecom.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { PersonalIdentityRepository } from "./personal-identity.repository.js";
import { WxMiniProgramLoginService } from "./wx-miniprogram-login.service.js";

@Module({
  imports: [ConfigModule, SessionModule, WecomModule],
  controllers: [AuthController],
  providers: [AuthRepository, AuthService, PersonalIdentityRepository, WxMiniProgramLoginService]
})
export class AuthModule {}
