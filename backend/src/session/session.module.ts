import { Module } from "@nestjs/common";
import { SessionTokenService } from "./session-token.service.js";

@Module({
  providers: [SessionTokenService],
  exports: [SessionTokenService]
})
export class SessionModule {}
