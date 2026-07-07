import { Body, Controller, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { adminAuthCodeRequestSchema } from "../contracts/admin-auth.js";
import { AdminAuthService } from "./admin-auth.service.js";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post("qy-login")
  @Throttle({ login: { ttl: 15 * 60 * 1000, limit: 5 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(adminAuthCodeRequestSchema.parse(body));
  }
}
