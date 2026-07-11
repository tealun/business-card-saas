import { Body, Controller, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  adminAuthCodeRequestSchema,
  adminChangePasswordRequestSchema,
  adminChangePasswordResponseSchema,
  adminPasswordLoginRequestSchema
} from "../contracts/admin-auth.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminAuthGuard, type AdminRequest } from "./admin-auth.guard.js";
import { PlatformAdminService } from "./platform-admin.service.js";
import { requireAdminSession } from "./admin-session.util.js";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly platformAdmins: PlatformAdminService
  ) {}

  @Post("qy-login")
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  qyLogin(@Body() body: unknown) {
    return this.auth.qyLogin(adminAuthCodeRequestSchema.parse(body));
  }

  @Post("login")
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  passwordLogin(@Body() body: unknown) {
    return this.platformAdmins.passwordLogin(adminPasswordLoginRequestSchema.parse(body));
  }

  @Put("password")
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  async changePassword(@Req() request: AdminRequest, @Body() body: unknown) {
    await this.platformAdmins.changePassword(
      requireAdminSession(request),
      adminChangePasswordRequestSchema.parse(body)
    );
    return adminChangePasswordResponseSchema.parse({ changed: true });
  }
}
