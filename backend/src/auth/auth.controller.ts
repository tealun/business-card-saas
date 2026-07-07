import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { authCodeRequestSchema } from "../contracts/auth.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("qy-login")
  @Throttle({ login: { ttl: 15 * 60 * 1000, limit: 5 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(authCodeRequestSchema.parse(body));
  }
}
