import { Body, Controller, Post } from "@nestjs/common";
import { authCodeRequestSchema } from "../contracts/auth.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("qy-login")
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(authCodeRequestSchema.parse(body));
  }
}
